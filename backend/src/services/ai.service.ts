import { Prisma } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/prisma';
import { GEMINI_GENERATIVE_MODEL, getGeminiClient, getGeminiType } from '../config/gemini';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import { hasSafeExtractionCoverage, matchExistingPartIds } from '../utils/part-identity';
import { withTransientAIRetry } from '../utils/ai-retry';
import {
    type CatalogExtraction,
    type ExtractedPart,
    extractCatalogDeterministically,
} from './catalog-extractor';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const storageBucket = process.env.STORAGE_BUCKET || 'catalogos';

if (!supabaseUrl || !supabaseKey) {
    throw new Error('❌ Chaves do Supabase não encontradas no .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
        normalizedPartNumber: string;
        page: number | null;
        notes: string | null;
        searchText: string;
    };
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

function isExtractedPart(value: unknown): value is ExtractedPart {
    if (!value || typeof value !== 'object') return false;
    const part = value as Record<string, unknown>;
    return typeof part.name === 'string' && typeof part.partNumber === 'string';
}

function catalogSnapshot(value: Prisma.JsonValue | null): CatalogExtraction | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const snapshot = value as Record<string, unknown>;
    if (!Array.isArray(snapshot.parts) || !snapshot.parts.every(isExtractedPart)) return null;

    return {
        manufacturer: cleanString(snapshot.manufacturer),
        models: Array.isArray(snapshot.models) ? snapshot.models.map(cleanString).filter(Boolean) : [],
        pncs: Array.isArray(snapshot.pncs) ? snapshot.pncs.map(cleanString).filter(Boolean) : [],
        parts: snapshot.parts,
    };
}

function embeddingBatchSize(): number {
    const configured = Number(process.env.EMBEDDING_BATCH_SIZE || '50');
    return Number.isFinite(configured) ? Math.min(100, Math.max(1, Math.trunc(configured))) : 50;
}

async function updateDocumentForJob(
    documentId: string,
    jobId: string,
    data: Prisma.DocumentUpdateManyMutationInput,
): Promise<void> {
    const updated = await prisma.document.updateMany({
        where: { id: documentId, processingJobId: jobId },
        data,
    });
    if (updated.count !== 1) throw new Error('STALE_DOCUMENT_JOB');
}

export class AIService {
    static async processDocument(documentId: string, tenantId: string, jobId: string): Promise<void> {
        const [ai, Type] = await Promise.all([getGeminiClient(), getGeminiType()]);
        let localFilePath: string | null = null;
        let uploadedFileName: string | null = null;

        try {
            console.log(`\n🧠 Iniciando processamento do documento: ${documentId}`);
            const document = await prisma.document.findUnique({ where: { id: documentId } });
            if (!document) throw new Error('Documento não encontrado no banco de dados.');
            if (document.tenantId !== tenantId) throw new Error('Documento não pertence ao tenant informado.');
            if (document.processingJobId !== jobId) throw new Error('STALE_DOCUMENT_JOB');

            const resumeIndexing = document.processingStage === 'INDEXING'
                && document.catalogRevision > 0
                && document.processingTotal > 0;

            await updateDocumentForJob(documentId, jobId, {
                status: document.status === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
                processingStage: resumeIndexing ? 'INDEXING' : 'DOWNLOADING',
                processingError: null,
            });

            if (document.url && !/^https?:\/\//i.test(document.url)) {
                const candidate = path.resolve(document.url);
                if (fs.existsSync(candidate)) localFilePath = candidate;
            }

            if (!localFilePath) {
                const reprocessDir = path.resolve('uploads');
                fs.mkdirSync(reprocessDir, { recursive: true });
                for (const candidatePath of storageCandidates(tenantId, documentId, document.storagePath)) {
                    const { data, error } = await supabase.storage.from(storageBucket).download(candidatePath);
                    if (error || !data) continue;
                    localFilePath = path.join(reprocessDir, `reprocess-${documentId}-${jobId}.pdf`);
                    fs.writeFileSync(localFilePath, Buffer.from(await data.arrayBuffer()));
                    console.log(`📦 PDF recuperado do Storage: ${candidatePath}`);
                    break;
                }
            }

            if (!localFilePath || !fs.existsSync(localFilePath)) {
                throw new Error('PDF original não encontrado no servidor nem no Storage.');
            }

            const fileBuffer = fs.readFileSync(localFilePath);
            const contentHash = createHash('sha256').update(fileBuffer).digest('hex');
            const canonicalStoragePath = `${tenantId}/${documentId}.pdf`;
            const { error: uploadError } = await supabase.storage
                .from(storageBucket)
                .upload(canonicalStoragePath, fileBuffer, { contentType: 'application/pdf', upsert: true });
            if (uploadError) throw new Error(`Erro no Supabase: ${uploadError.message}`);

            await updateDocumentForJob(documentId, jobId, {
                storagePath: canonicalStoragePath,
                url: canonicalStoragePath,
                contentHash,
            });

            let extraction = catalogSnapshot(document.extractionSnapshot);
            let extractionMethod = document.extractionMethod || 'SNAPSHOT';

            if (extraction) {
                console.log(`♻️ Extração persistida reutilizada (${extraction.parts.length} peças).`);
            } else {
                await updateDocumentForJob(documentId, jobId, { processingStage: 'EXTRACTING' });
                try {
                    const deterministic = await extractCatalogDeterministically(localFilePath, {
                        manufacturer: document.manufacturer,
                        model: document.model,
                        pnc: document.pnc,
                    });
                    if (deterministic) {
                        extraction = deterministic.extraction;
                        extractionMethod = deterministic.method;
                        console.log(`📋 Extração determinística concluída com ${extraction.parts.length} peças.`);
                    }
                } catch (error) {
                    console.warn('⚠️ Leitura textual do PDF indisponível; usando extração por IA.', error);
                }

                if (!extraction) {
                    const uploadedFile = await withTransientAIRetry(
                        () => ai.files.upload({
                            file: localFilePath as string,
                            config: { mimeType: 'application/pdf' },
                        }),
                        { label: `upload do catálogo ${documentId} para a IA` },
                    );
                    uploadedFileName = uploadedFile.name || null;
                    if (!uploadedFile.uri) throw new Error('Gemini não retornou URI do arquivo.');

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
- Analise todas as vistas explodidas e todas as tabelas correspondentes, da primeira até a última página.
- Relacione corretamente cada posição da vista ao Part Number da tabela.
- Preserve o Part Number EXATAMENTE como aparece no catálogo. Nunca corrija, traduza ou complete código.
- Não misture modelos parecidos (ex.: 143R, 143RS, 143RII).
- Identifique o PNC/Product Number Code quando o catálogo informar essa variação.
- Se a peça estiver explicitamente indicada como válida para todos os PNCs do modelo, marque universalAcrossPnc=true.
- Não marque universalAcrossPnc=true apenas por suposição.
- Uma peça repetida em posições ou seções diferentes deve gerar registros diferentes.
- Nomes alternativos devem ser apenas nomes/descrições encontrados no próprio catálogo.
- Se um dado não existir, retorne string vazia; para página desconhecida use 0.
- Extraia todas as peças que conseguir identificar com segurança, sem encerrar antes da última tabela.
- Para cada peça, informe o modelo e PNC específicos aplicáveis àquela linha.

O campo manufacturer no nível do catálogo deve ser o fabricante principal.
models deve listar os modelos encontrados no documento.
pncs deve listar todos os PNCs explicitamente encontrados no documento.
`;

                    const response = await withTransientAIRetry(
                        () => ai.models.generateContent({
                            model: GEMINI_GENERATIVE_MODEL,
                            contents: [{
                                role: 'user',
                                parts: [
                                    { fileData: { fileUri: uploadedFile.uri, mimeType: 'application/pdf' } },
                                    { text: prompt },
                                ],
                            }],
                            config: {
                                responseMimeType: 'application/json',
                                responseSchema: {
                                    type: Type.OBJECT,
                                    properties: {
                                        manufacturer: { type: Type.STRING },
                                        models: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        pncs: { type: Type.ARRAY, items: { type: Type.STRING } },
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
                                                    alternativeNames: { type: Type.ARRAY, items: { type: Type.STRING } },
                                                    partNumber: { type: Type.STRING },
                                                    page: { type: Type.INTEGER },
                                                    notes: { type: Type.STRING },
                                                },
                                                required: [
                                                    'manufacturer', 'model', 'pnc', 'universalAcrossPnc',
                                                    'section', 'position', 'name', 'alternativeNames',
                                                    'partNumber', 'page', 'notes',
                                                ],
                                            },
                                        },
                                    },
                                    required: ['manufacturer', 'models', 'pncs', 'parts'],
                                },
                            },
                        }),
                        { label: `extração do catálogo ${documentId}` },
                    );
                    if (!response.text?.trim()) throw new Error('Gemini não conseguiu extrair informações do PDF.');
                    try {
                        extraction = JSON.parse(response.text) as CatalogExtraction;
                    } catch {
                        throw new Error('Gemini retornou JSON inválido durante a extração do catálogo.');
                    }
                    extractionMethod = `GEMINI:${GEMINI_GENERATIVE_MODEL}`;
                }

                if (!Array.isArray(extraction.parts) || extraction.parts.length === 0) {
                    throw new Error('Nenhuma peça foi encontrada no catálogo.');
                }
                await updateDocumentForJob(documentId, jobId, {
                    extractionSnapshot: extraction as unknown as Prisma.InputJsonValue,
                    extractionMethod,
                    extractedAt: new Date(),
                });
            }

            if (!extraction || !Array.isArray(extraction.parts) || extraction.parts.length === 0) {
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
                const name = cleanString(rawPart.name);
                const partNumber = cleanString(rawPart.partNumber);
                const model = cleanString(rawPart.model)
                    || document.model
                    || (models.length === 1 ? models[0] : '');
                if (!name || !partNumber || !model) continue;

                const manufacturer = cleanString(rawPart.manufacturer)
                    || document.manufacturer
                    || extractedManufacturer
                    || '';
                let pnc = cleanString(rawPart.pnc) || document.pnc || '';
                const universalAcrossPnc = Boolean(rawPart.universalAcrossPnc) || isUniversalPnc(pnc);
                if (universalAcrossPnc) pnc = '';

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
                        normalizedPartNumber: normalizeIdentifier(partNumber),
                        page,
                        notes: notes || null,
                        searchText,
                    },
                });
            }

            if (!preparedParts.length) throw new Error('Nenhuma peça válida conseguiu ser preparada.');
            const existingParts = await prisma.part.findMany({
                where: { documentId },
                orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
                select: {
                    id: true,
                    active: true,
                    model: true,
                    pnc: true,
                    universalAcrossPnc: true,
                    partNumber: true,
                    section: true,
                    position: true,
                    embeddingRevision: true,
                },
            });
            const identifiedParts = matchExistingPartIds(
                preparedParts.map((preparedPart) => preparedPart.data),
                existingParts,
            );
            const previousActiveCount = existingParts.filter((part) => part.active).length;
            const configuredMinimumRatio = Number(process.env.MIN_REPROCESS_PART_RATIO || '0.5');
            if (!hasSafeExtractionCoverage(previousActiveCount, preparedParts.length, configuredMinimumRatio)) {
                throw new Error(
                    `Reprocessamento interrompido por segurança: a extração retornou ${preparedParts.length} de ${previousActiveCount} peças anteriormente ativas.`,
                );
            }

            const canResumeRevision = resumeIndexing
                && document.catalogRevision > 0
                && document.processingTotal === preparedParts.length
                && existingParts.filter((part) => part.active).length === preparedParts.length
                && identifiedParts.every((part) => Boolean(part.existingId));
            const revision = canResumeRevision ? document.catalogRevision : document.catalogRevision + 1;
            let activePartIds: string[];

            if (canResumeRevision) {
                activePartIds = identifiedParts.map((part) => part.existingId as string);
                await updateDocumentForJob(documentId, jobId, {
                    status: 'COMPLETED',
                    processingStage: 'INDEXING',
                    processingTotal: preparedParts.length,
                    processingError: null,
                });
                console.log(`↪️ Retomando indexação da revisão ${revision}.`);
            } else {
                activePartIds = await prisma.$transaction(async (tx) => {
                    const ids: string[] = [];
                    for (const [index, identifiedPart] of identifiedParts.entries()) {
                        const partData = {
                            ...identifiedPart.item,
                            sourceKey: identifiedPart.sourceKey,
                            active: true,
                            retiredAt: null,
                            extractionRevision: revision,
                            embeddingRevision: 0,
                        };
                        const savedPart = identifiedPart.existingId
                            ? await tx.part.update({ where: { id: identifiedPart.existingId }, data: partData })
                            : await tx.part.create({ data: partData });
                        ids.push(savedPart.id);
                        await tx.$executeRaw`
                            UPDATE "Part" SET "embedding" = NULL, "embeddingRevision" = 0
                            WHERE "id" = ${savedPart.id}
                        `;
                        if ((index + 1) % 100 === 0) {
                            console.log(`💾 ${index + 1}/${preparedParts.length} peças preparadas para persistência.`);
                        }
                    }

                    await tx.part.updateMany({
                        where: { documentId, active: true, id: { notIn: ids } },
                        data: { active: false, retiredAt: new Date() },
                    });
                    const documentUpdate = await tx.document.updateMany({
                        where: { id: documentId, processingJobId: jobId },
                        data: {
                            manufacturer: document.manufacturer || extractedManufacturer || null,
                            model: document.model || (models.length === 1 ? models[0] : null),
                            pnc: document.pnc || (pncs.length === 1 ? pncs[0] : null),
                            storagePath: canonicalStoragePath,
                            url: canonicalStoragePath,
                            contentHash,
                            status: 'COMPLETED',
                            catalogRevision: revision,
                            processingStage: 'INDEXING',
                            processingCurrent: 0,
                            processingTotal: preparedParts.length,
                            processingError: null,
                        },
                    });
                    if (documentUpdate.count !== 1) throw new Error('STALE_DOCUMENT_JOB');
                    return ids;
                }, { maxWait: 10_000, timeout: 120_000 });
                console.log(`💾 Catálogo já utilizável: ${preparedParts.length} peças salvas na revisão ${revision}.`);
            }

            const revisionRows = await prisma.part.findMany({
                where: { id: { in: activePartIds } },
                select: { id: true, embeddingRevision: true },
            });
            const embeddingRevisionById = new Map(revisionRows.map((part) => [part.id, part.embeddingRevision]));
            const pendingIndexes = activePartIds
                .map((id, index) => ({ id, index }))
                .filter(({ id }) => embeddingRevisionById.get(id) !== revision);
            let indexedCount = preparedParts.length - pendingIndexes.length;

            await updateDocumentForJob(documentId, jobId, {
                status: 'COMPLETED',
                processingStage: 'INDEXING',
                processingCurrent: indexedCount,
                processingTotal: preparedParts.length,
            });

            // =========================================================
            // MOTOR DE EMBEDDINGS (COM ANTI-BLOQUEIO FREE TIER)
            // =========================================================
            const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
            const batchSize = 10; // 🚀 Reduzido para 10 para não estourar o limite de Tokens do Free Tier

            for (let offset = 0; offset < pendingIndexes.length; offset += batchSize) {
                const batch = pendingIndexes.slice(offset, offset + batchSize);

                const embedResult = await withTransientAIRetry(
                    () => ai.models.embedContent({
                        model: 'text-embedding-004', // 🚀 CORREÇÃO VITAL DO MODELO AQUI!
                        contents: batch.map(({ index }) => preparedParts[index].data.searchText),
                        config: { outputDimensionality: 768, taskType: 'RETRIEVAL_DOCUMENT' },
                    }),
                    { label: `lote de embeddings ${offset + 1}-${offset + batch.length}` },
                );

                const embeddings = embedResult.embeddings || [];
                if (embeddings.length !== batch.length) {
                    throw new Error(`A IA retornou ${embeddings.length} embeddings para um lote de ${batch.length} peças.`);
                }

                await prisma.$transaction(async (tx) => {
                    for (const [batchIndex, item] of batch.entries()) {
                        const values = embeddings[batchIndex]?.values;
                        if (!values || values.length !== 768) {
                            throw new Error(`Embedding inválido para a peça ${preparedParts[item.index].data.partNumber}.`);
                        }
                        const embeddingString = `[${values.join(',')}]`;
                        await tx.$executeRaw`
                            UPDATE "Part"
                            SET "embedding" = ${embeddingString}::vector, "embeddingRevision" = ${revision}
                            WHERE "id" = ${item.id}
                        `;
                    }
                    indexedCount += batch.length;
                    const progress = await tx.document.updateMany({
                        where: { id: documentId, processingJobId: jobId },
                        data: { processingCurrent: indexedCount, processingTotal: preparedParts.length },
                    });
                    if (progress.count !== 1) throw new Error('STALE_DOCUMENT_JOB');
                }, { maxWait: 10_000, timeout: 60_000 });

                console.log(`🔎 Indexação semântica: ${indexedCount}/${preparedParts.length}.`);

                // 🚀 O SEGREDO: Pausa para esfriar a API entre os lotes
                if (offset + batchSize < pendingIndexes.length) {
                    console.log(`⏳ Respirando por 3 segundos para evitar bloqueio do Google...`);
                    await sleep(3000);
                }
            }

            await updateDocumentForJob(documentId, jobId, {
                status: 'COMPLETED',
                processingStage: 'READY',
                processingCurrent: preparedParts.length,
                processingTotal: preparedParts.length,
                processingError: null,
            });
            console.log(`🏆 Catálogo ${documentId}: revisão ${revision} concluída com ${preparedParts.length} peças ativas.`);
        } catch (error) {
            if (error instanceof Error && error.message === 'STALE_DOCUMENT_JOB') {
                console.warn(`🧹 Trabalho obsoleto do documento ${documentId} foi interrompido.`);
            } else {
                console.error('❌ Erro fatal no AIService:', error);
            }
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
