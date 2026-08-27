import { prisma } from '../config/prisma';
import { getGeminiClient, getGeminiType } from '../config/gemini';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const storageBucket = process.env.STORAGE_BUCKET || 'catalogos';

if (!supabaseUrl || !supabaseKey) {
    throw new Error('❌ Chaves do Supabase não encontradas no .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface ExtractedPart {
    manufacturer: string;
    model: string;
    pnc: string;
    universalAcrossPnc: boolean;
    section: string;
    position: string;
    name: string;
    alternativeNames: string[];
    partNumber: string;
    page: number;
    notes: string;
}

interface CatalogExtraction {
    manufacturer: string;
    models: string[];
    pncs: string[];
    parts: ExtractedPart[];
}

interface PreparedPart {
    data: {
        documentId: string;
        manufacturer: string | null;
        normalizedManufacturer: string | null;
        model: string;
        normalizedModel: string;
        pnc: string | null;
        normalizedPnc: string | null;
        universalAcrossPnc: boolean;
        section: string | null;
        position: string | null;
        name: string;
        normalizedName: string;
        alternativeNames: string[];
        partNumber: string;
        page: number | null;
        notes: string | null;
        searchText: string;
    };
    embeddingString: string;
}

function cleanString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isUniversalPnc(value: string): boolean {
    const normalized = normalizeIdentifier(value);
    return ['ALL', 'ANY', 'TODOS', 'QUALQUER', 'QUALQUERUM', 'UNIVERSAL'].includes(normalized);
}

function storageCandidates(tenantId: string, documentId: string, storagePath?: string | null): string[] {
    return [...new Set(
        [storagePath, `${tenantId}/${documentId}.pdf`, `${documentId}.pdf`]
            .filter((value): value is string => Boolean(value)),
    )];
}

export class AIService {
    static async processDocument(documentId: string, tenantId: string): Promise<void> {
        const [ai, Type] = await Promise.all([getGeminiClient(), getGeminiType()]);
        let localFilePath: string | null = null;
        let uploadedFileName: string | null = null;

        try {
            console.log(`\n🧠 Iniciando processamento do documento: ${documentId}`);

            const document = await prisma.document.findUnique({
                where: { id: documentId },
            });

            if (!document) {
                throw new Error('Documento não encontrado no banco de dados.');
            }

            if (document.tenantId !== tenantId) {
                throw new Error('Documento não pertence ao tenant informado.');
            }

            if (document.url && !/^https?:\/\//i.test(document.url)) {
                const candidate = path.resolve(document.url);
                if (fs.existsSync(candidate)) {
                    localFilePath = candidate;
                }
            }

            if (!localFilePath) {
                const reprocessDir = path.resolve('uploads');
                fs.mkdirSync(reprocessDir, { recursive: true });

                for (const candidatePath of storageCandidates(tenantId, documentId, document.storagePath)) {
                    const { data, error } = await supabase.storage
                        .from(storageBucket)
                        .download(candidatePath);

                    if (error || !data) {
                        continue;
                    }

                    localFilePath = path.join(reprocessDir, `reprocess-${documentId}.pdf`);
                    const arrayBuffer = await data.arrayBuffer();
                    fs.writeFileSync(localFilePath, Buffer.from(arrayBuffer));
                    console.log(`📦 PDF recuperado do Storage: ${candidatePath}`);
                    break;
                }
            }

            if (!localFilePath || !fs.existsSync(localFilePath)) {
                throw new Error('PDF original não encontrado no servidor nem no Storage.');
            }

            const fileBuffer = fs.readFileSync(localFilePath);
            const canonicalStoragePath = `${tenantId}/${documentId}.pdf`;

            const { error: uploadError } = await supabase.storage
                .from(storageBucket)
                .upload(canonicalStoragePath, fileBuffer, {
                    contentType: 'application/pdf',
                    upsert: true,
                });

            if (uploadError) {
                throw new Error(`Erro no Supabase: ${uploadError.message}`);
            }

            await prisma.document.update({
                where: { id: documentId },
                data: { storagePath: canonicalStoragePath },
            });

            const uploadedFile = await ai.files.upload({
                file: localFilePath,
                config: { mimeType: 'application/pdf' },
            });

            uploadedFileName = uploadedFile.name || null;

            if (!uploadedFile.uri) {
                throw new Error('Gemini não retornou URI do arquivo.');
            }

            const metadataHints = [
                document.manufacturer ? `Fabricante informado no upload: ${document.manufacturer}` : '',
                document.model ? `Modelo informado no upload: ${document.model}` : '',
                document.pnc ? `PNC informado no upload: ${document.pnc}` : '',
            ].filter(Boolean).join('\n');

            const prompt = `
Você é um especialista em catálogos técnicos de peças e vistas explodidas.
Extraia os dados do PDF para uma base estruturada usada em uma loja de peças.

${metadataHints ? `DADOS INFORMADOS PELO USUÁRIO (use como pista, mas não contradiga o PDF):\n${metadataHints}\n` : ''}
REGRAS CRÍTICAS:
- Analise as vistas explodidas e as tabelas correspondentes.
- Relacione corretamente cada posição da vista ao Part Number da tabela.
- Preserve o Part Number EXATAMENTE como aparece no catálogo. Nunca corrija, traduza ou complete código.
- Não misture modelos parecidos (ex.: 143R, 143RS, 143RII).
- Identifique o PNC/Product Number Code quando o catálogo informar essa variação.
- Se a peça estiver explicitamente indicada como válida para todos os PNCs do modelo, marque universalAcrossPnc=true.
- Não marque universalAcrossPnc=true apenas porque você acredita que a peça seja compatível. Isso precisa estar explícito no catálogo.
- Uma peça repetida em posições diferentes deve gerar registros diferentes.
- Nomes alternativos devem ser apenas nomes/descrições encontrados no próprio catálogo. Não invente traduções.
- Se um dado não existir, retorne string vazia; para página desconhecida use 0.
- Extraia todas as peças que conseguir identificar com segurança.
- Para cada peça, informe o modelo e PNC específicos aplicáveis àquela linha. Se o documento tiver apenas um modelo/PNC, repita-o nas peças.

O campo manufacturer no nível do catálogo deve ser o fabricante principal.
models deve listar os modelos encontrados no documento.
pncs deve listar todos os PNCs explicitamente encontrados no documento.
`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                fileData: {
                                    fileUri: uploadedFile.uri,
                                    mimeType: 'application/pdf',
                                },
                            },
                            { text: prompt },
                        ],
                    },
                ],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            manufacturer: { type: Type.STRING },
                            models: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            pncs: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                            },
                            parts: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        manufacturer: { type: Type.STRING },
                                        model: { type: Type.STRING },
                                        pnc: { type: Type.STRING },
                                        universalAcrossPnc: { type: Type.BOOLEAN },
                                        section: { type: Type.STRING },
                                        position: { type: Type.STRING },
                                        name: { type: Type.STRING },
                                        alternativeNames: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING },
                                        },
                                        partNumber: { type: Type.STRING },
                                        page: { type: Type.INTEGER },
                                        notes: { type: Type.STRING },
                                    },
                                    required: [
                                        'manufacturer',
                                        'model',
                                        'pnc',
                                        'universalAcrossPnc',
                                        'section',
                                        'position',
                                        'name',
                                        'alternativeNames',
                                        'partNumber',
                                        'page',
                                        'notes',
                                    ],
                                },
                            },
                        },
                        required: ['manufacturer', 'models', 'pncs', 'parts'],
                    },
                },
            });

            if (!response.text?.trim()) {
                throw new Error('Gemini não conseguiu extrair informações do PDF.');
            }

            let extraction: CatalogExtraction;

            try {
                extraction = JSON.parse(response.text) as CatalogExtraction;
            } catch {
                throw new Error('Gemini retornou JSON inválido durante a extração do catálogo.');
            }

            if (!Array.isArray(extraction.parts) || extraction.parts.length === 0) {
                throw new Error('Nenhuma peça foi encontrada no catálogo.');
            }

            const extractedManufacturer = cleanString(extraction.manufacturer);
            const models = Array.isArray(extraction.models)
                ? extraction.models.map(cleanString).filter(Boolean)
                : [];
            const pncs = Array.isArray(extraction.pncs)
                ? extraction.pncs.map(cleanString).filter(Boolean)
                : [];

            const preparedParts: PreparedPart[] = [];

            for (const rawPart of extraction.parts) {
                try {
                    const name = cleanString(rawPart.name);
                    const partNumber = cleanString(rawPart.partNumber);
                    const model = cleanString(rawPart.model)
                        || document.model
                        || (models.length === 1 ? models[0] : '');

                    if (!name || !partNumber || !model) {
                        continue;
                    }

                    const manufacturer = cleanString(rawPart.manufacturer)
                        || document.manufacturer
                        || extractedManufacturer
                        || '';

                    let pnc = cleanString(rawPart.pnc) || document.pnc || '';
                    const universalAcrossPnc = Boolean(rawPart.universalAcrossPnc) || isUniversalPnc(pnc);

                    if (universalAcrossPnc) {
                        pnc = '';
                    }

                    const section = cleanString(rawPart.section);
                    const position = cleanString(rawPart.position);
                    const aliases = Array.isArray(rawPart.alternativeNames)
                        ? [...new Set(rawPart.alternativeNames.map(cleanString).filter(Boolean))]
                        : [];
                    const page = Number.isInteger(rawPart.page) && rawPart.page > 0 ? rawPart.page : null;
                    const notes = cleanString(rawPart.notes);

                    const searchText = [
                        `Fabricante: ${manufacturer}`,
                        `Modelo: ${model}`,
                        pnc ? `PNC: ${pnc}` : '',
                        section ? `Seção: ${section}` : '',
                        position ? `Posição: ${position}` : '',
                        `Peça: ${name}`,
                        aliases.length ? `Nomes alternativos: ${aliases.join(', ')}` : '',
                        `Part Number: ${partNumber}`,
                        notes ? `Observações: ${notes}` : '',
                    ].filter(Boolean).join('\n');

                    const embedResult = await ai.models.embedContent({
                        model: 'gemini-embedding-001',
                        contents: searchText,
                        config: {
                            outputDimensionality: 768,
                            taskType: 'RETRIEVAL_DOCUMENT',
                            title: `${model} - ${name}`,
                        },
                    });

                    const embedding = embedResult.embeddings?.[0]?.values;
                    if (!embedding || embedding.length !== 768) {
                        console.warn(`⚠️ Embedding inválido para ${model} / ${name}.`);
                        continue;
                    }

                    preparedParts.push({
                        data: {
                            documentId,
                            manufacturer: manufacturer || null,
                            normalizedManufacturer: normalizeIdentifier(manufacturer) || null,
                            model,
                            normalizedModel: normalizeIdentifier(model),
                            pnc: pnc || null,
                            normalizedPnc: normalizeIdentifier(pnc) || null,
                            universalAcrossPnc,
                            section: section || null,
                            position: position || null,
                            name,
                            normalizedName: normalizeText(name),
                            alternativeNames: aliases,
                            partNumber,
                            page,
                            notes: notes || null,
                            searchText,
                        },
                        embeddingString: `[${embedding.join(',')}]`,
                    });
                } catch (partError) {
                    console.error('⚠️ Erro ao preparar uma peça extraída:', partError);
                }
            }

            if (preparedParts.length === 0) {
                throw new Error('Nenhuma peça válida conseguiu ser preparada.');
            }

            await prisma.$transaction(
                async (tx) => {
                    await tx.part.deleteMany({ where: { documentId } });
                    await tx.documentChunk.deleteMany({ where: { documentId } });

                    for (const preparedPart of preparedParts) {
                        const created = await tx.part.create({
                            data: preparedPart.data,
                        });

                        await tx.$executeRaw`
                            UPDATE "Part"
                            SET "embedding" = ${preparedPart.embeddingString}::vector
                            WHERE "id" = ${created.id}
                        `;
                    }

                    await tx.document.update({
                        where: { id: documentId },
                        data: {
                            manufacturer: document.manufacturer || extractedManufacturer || null,
                            model: document.model || (models.length === 1 ? models[0] : null),
                            pnc: document.pnc || (pncs.length === 1 ? pncs[0] : null),
                            storagePath: canonicalStoragePath,
                        },
                    });
                },
                {
                    maxWait: 10_000,
                    timeout: 120_000,
                },
            );

            console.log(`🏆 Catálogo ${documentId}: ${preparedParts.length} peças estruturadas com sucesso.`);
        } catch (error) {
            console.error('❌ Erro fatal no AIService:', error);
            throw error;
        } finally {
            if (localFilePath && fs.existsSync(localFilePath)) {
                try {
                    fs.unlinkSync(localFilePath);
                } catch (error) {
                    console.warn('⚠️ Não foi possível remover o arquivo temporário:', error);
                }
            }

            if (uploadedFileName) {
                try {
                    await ai.files.delete({ name: uploadedFileName });
                } catch (error) {
                    console.warn('⚠️ Não foi possível remover arquivo temporário do Gemini:', error);
                }
            }
        }
    }
}
