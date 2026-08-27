import { prisma } from '../config/prisma';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';

const apiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const storageBucket = process.env.STORAGE_BUCKET || 'catalogos';

if (!apiKey || !supabaseUrl || !supabaseKey) {
    throw new Error('❌ Chaves de API (Gemini ou Supabase) não encontradas no .env');
}

const ai = new GoogleGenAI({ apiKey });
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

function cleanString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isUniversalPnc(value: string): boolean {
    const normalized = normalizeIdentifier(value);
    return ['ALL', 'ANY', 'TODOS', 'QUALQUER', 'QUALQUERUM', 'UNIVERSAL'].includes(normalized);
}

export class AIService {
    static async processDocument(documentId: string, tenantId: string): Promise<void> {
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

            // No primeiro processamento, document.url aponta para o upload local.
            // Em um reprocessamento esse arquivo já foi removido; nesse caso
            // recuperamos o PDF original do bucket privado pelo storagePath.
            if (document.url && !/^https?:\/\//i.test(document.url)) {
                const candidate = path.resolve(document.url);
                if (fs.existsSync(candidate)) {
                    localFilePath = candidate;
                }
            }

            if (!localFilePath && document.storagePath) {
                const { data, error } = await supabase.storage
                    .from(storageBucket)
                    .download(document.storagePath);

                if (error || !data) {
                    throw new Error(`Não foi possível recuperar o PDF original para reprocessamento: ${error?.message || 'arquivo indisponível'}`);
                }

                const reprocessDir = path.resolve('uploads');
                fs.mkdirSync(reprocessDir, { recursive: true });
                localFilePath = path.join(reprocessDir, `reprocess-${documentId}.pdf`);
                const arrayBuffer = await data.arrayBuffer();
                fs.writeFileSync(localFilePath, Buffer.from(arrayBuffer));
            }

            if (!localFilePath || !fs.existsSync(localFilePath)) {
                throw new Error('PDF original não encontrado no servidor nem no Storage.');
            }

            // 1. Mantém o PDF original no Storage para biblioteca/visualização/download.
            const fileBuffer = fs.readFileSync(localFilePath);
            const storagePath = `${tenantId}/${documentId}.pdf`;

            const { error: uploadError } = await supabase.storage
                .from(storageBucket)
                .upload(storagePath, fileBuffer, {
                    contentType: 'application/pdf',
                    upsert: true,
                });

            if (uploadError) {
                throw new Error(`Erro no Supabase: ${uploadError.message}`);
            }

            // O bucket pode permanecer privado. O frontend acessa o PDF
            // somente por signed URL gerada pelo backend.
            await prisma.document.update({
                where: { id: documentId },
                data: {
                    storagePath,
                },
            });

            // 2. O mesmo PDF é enviado temporariamente ao Gemini para leitura multimodal.
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

            await prisma.document.update({
                where: { id: documentId },
                data: {
                    manufacturer: document.manufacturer || extractedManufacturer || null,
                    model: document.model || (models.length === 1 ? models[0] : null),
                    pnc: document.pnc || (pncs.length === 1 ? pncs[0] : null),
                },
            });

            // Reprocessamento é idempotente: substitui as peças antigas deste catálogo.
            await prisma.part.deleteMany({ where: { documentId } });
            await prisma.documentChunk.deleteMany({ where: { documentId } });

            let processed = 0;

            for (const rawPart of extraction.parts) {
                try {
                    const name = cleanString(rawPart.name);
                    const partNumber = cleanString(rawPart.partNumber);
                    const model = cleanString(rawPart.model) || document.model || (models.length === 1 ? models[0] : '');

                    // Sem nome, código ou modelo não existe base segura para vender a peça.
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

                    const created = await prisma.part.create({
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
                    });

                    const embeddingString = `[${embedding.join(',')}]`;
                    await prisma.$executeRaw`
                        UPDATE "Part"
                        SET "embedding" = ${embeddingString}::vector
                        WHERE "id" = ${created.id}
                    `;

                    processed++;
                } catch (partError) {
                    console.error('⚠️ Erro ao armazenar uma peça extraída:', partError);
                }
            }

            if (processed === 0) {
                throw new Error('Nenhuma peça válida conseguiu ser armazenada.');
            }

            console.log(`🏆 Catálogo ${documentId}: ${processed} peças estruturadas com sucesso.`);
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
