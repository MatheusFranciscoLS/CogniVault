import { Prisma } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../config/prisma';
import { GEMINI_EMBEDDING_MODEL, GEMINI_GENERATIVE_MODEL, getGeminiClient } from '../config/gemini';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import { countDistinctPartOccurrences, hasSafeExtractionCoverage, matchExistingPartIds } from '../utils/part-identity';
import { shouldForceCatalogReextraction } from '../utils/document-processing-intent';
import { withTransientAIRetry } from '../utils/ai-retry';
import {
    type CatalogExtraction,
    type ExtractedPart,
    extractCatalogDeterministically,
    inferCatalogModelFromFilename,
    isPlausibleCatalogModel,
    normalizeHusqvarnaPnc,
} from './catalog-extractor';
import { buildPartRetrievalContext } from './part-index-context';
import { semanticIndexingEnabled, semanticPartBudgetPerDocument } from './semantic-indexing-policy';
import { invalidateHomeCountsCache } from '../controllers/operational.controller';

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

async function pathExists(value: string): Promise<boolean> {
    try {
        await access(value);
        return true;
    } catch {
        return false;
    }
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

function readableIndexingWarning(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
        return 'Catálogo pronto para busca textual. O índice semântico opcional ficou pendente porque a cota da IA foi atingida.';
    }
    return `Catálogo pronto para busca textual. Índice semântico opcional pendente: ${message.slice(0, 360)}`;
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
        let ai: Awaited<ReturnType<typeof getGeminiClient>> | null = null;
        let localFilePath: string | null = null;
        let downloadedStoragePath: string | null = null;
        let uploadedFileName: string | null = null;

        try {
            console.log(`\n🧠 Iniciando processamento do documento: ${documentId}`);
            const document = await prisma.document.findUnique({ where: { id: documentId } });
            if (!document) throw new Error('Documento não encontrado no banco de dados.');
            if (document.tenantId !== tenantId) throw new Error('Documento não pertence ao tenant informado.');
            if (document.processingJobId !== jobId) throw new Error('STALE_DOCUMENT_JOB');

            const forceReextraction = shouldForceCatalogReextraction(document.status, document.processingStage);
            const resumeIndexing = !forceReextraction && document.processingStage === 'INDEXING'
                && document.catalogRevision > 0
                && document.processingTotal > 0;

            await updateDocumentForJob(documentId, jobId, {
                status: document.status === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
                processingStage: resumeIndexing ? 'INDEXING' : 'DOWNLOADING',
                processingError: null,
            });

            if (document.url && !/^https?:\/\//i.test(document.url)) {
                const candidate = path.resolve(document.url);
                if (await pathExists(candidate)) localFilePath = candidate;
            }

            if (!localFilePath) {
                const reprocessDir = path.resolve('uploads');
                await mkdir(reprocessDir, { recursive: true });
                for (const candidatePath of storageCandidates(tenantId, documentId, document.storagePath)) {
                    const { data, error } = await supabase.storage.from(storageBucket).download(candidatePath);
                    if (error || !data) continue;
                    localFilePath = path.join(reprocessDir, `reprocess-${documentId}-${jobId}.pdf`);
                    await writeFile(localFilePath, Buffer.from(await data.arrayBuffer()));
                    downloadedStoragePath = candidatePath;
                    console.log(`📦 PDF recuperado do Storage: ${candidatePath}`);
                    break;
                }
            }

            if (!localFilePath || !(await pathExists(localFilePath))) {
                throw new Error('PDF original não encontrado no servidor nem no Storage.');
            }

            const fileBuffer = await readFile(localFilePath);
            const contentHash = createHash('sha256').update(fileBuffer).digest('hex');
            const canonicalStoragePath = `${tenantId}/${documentId}.pdf`;
            if (downloadedStoragePath !== canonicalStoragePath) {
                const { error: uploadError } = await supabase.storage
                    .from(storageBucket)
                    .upload(canonicalStoragePath, fileBuffer, { contentType: 'application/pdf', upsert: true });
                if (uploadError) throw new Error(`Erro no Supabase: ${uploadError.message}`);
            }

            await updateDocumentForJob(documentId, jobId, {
                storagePath: canonicalStoragePath,
                url: canonicalStoragePath,
                contentHash,
            });

            let extraction = forceReextraction ? null : catalogSnapshot(document.extractionSnapshot);
            let extractionMethod = forceReextraction ? 'REEXTRACTION' : (document.extractionMethod || 'SNAPSHOT');

            if (extraction) {
                console.log(`♻️ Extração persistida reutilizada (${extraction.parts.length} peças).`);
            } else {
                await updateDocumentForJob(documentId, jobId, { processingStage: 'EXTRACTING' });
                try {
                    const deterministic = await extractCatalogDeterministically(localFilePath, {
                        manufacturer: document.manufacturer,
                        model: document.model,
                        pnc: document.pnc,
                        filename: document.filename,
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
                    await updateDocumentForJob(documentId, jobId, {
                        processingStage: 'AI_EXTRACTION',
                        processingError: 'Tabela textual não reconhecida; iniciando leitura visual assistida.',
                    });
                    const gemini = await getGeminiClient();
                    ai = gemini;
                    const uploadedFile = await withTransientAIRetry(
                        () => gemini.files.upload({
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
- Se o catálogo for de um MOTOR (ex.: Kawasaki FR691V, FX921V, FS730V, Kohler, Briggs & Stratton, Husqvarna HV/HS) utilizado em cortadores giro zero ou tratores, defina o fabricante do motor (ex: Kawasaki) e o código do motor no campo models e nas peças. Não confunda o motor com o chassi da máquina que ele equipa.
- Para cada peça, informe o modelo e PNC específicos aplicáveis àquela linha.

O campo manufacturer no nível do catálogo deve ser o fabricante principal (ex: Husqvarna, Kawasaki, Kohler).
models deve listar os modelos encontrados no documento.
pncs deve listar todos os PNCs explicitamente encontrados no documento.
`;

                    const response = await withTransientAIRetry(
                        () => gemini.interactions.create({
                            model: GEMINI_GENERATIVE_MODEL,
                            input: [
                                { type: 'document', uri: uploadedFile.uri as string, mime_type: 'application/pdf' },
                                { type: 'text', text: prompt },
                            ],
                            response_format: {
                                type: 'text',
                                mime_type: 'application/json',
                                schema: {
                                type: 'object',
                                properties: {
                                    manufacturer: { type: 'string' },
                                    models: { type: 'array', items: { type: 'string' } },
                                    pncs: { type: 'array', items: { type: 'string' } },
                                    parts: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                manufacturer: { type: 'string' },
                                                model: { type: 'string' },
                                                pnc: { type: 'string' },
                                                universalAcrossPnc: { type: 'boolean' },
                                                section: { type: 'string' },
                                                position: { type: 'string' },
                                                name: { type: 'string' },
                                                alternativeNames: { type: 'array', items: { type: 'string' } },
                                                partNumber: { type: 'string' },
                                                page: { type: 'integer' },
                                                notes: { type: 'string' },
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
                    const rawOutput = String((response as any).output_text || '').trim();
                    if (!rawOutput) throw new Error('Gemini não conseguiu extrair informações do PDF.');
                    const cleanedOutput = rawOutput.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                    try {
                        extraction = JSON.parse(cleanedOutput) as CatalogExtraction;
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
                ? extraction.models.map(cleanString).filter(isPlausibleCatalogModel)
                : [];
            const pncs = Array.isArray(extraction.pncs)
                ? extraction.pncs.map(value => normalizeHusqvarnaPnc(cleanString(value))).filter(Boolean)
                : [];
            const trustedDocumentModel = isPlausibleCatalogModel(document.model) ? cleanString(document.model) : '';
            const trustedDocumentPnc = normalizeHusqvarnaPnc(document.pnc);
            const preparedParts: PreparedPart[] = [];

            for (const rawPart of extraction.parts) {
                const name = cleanString(rawPart.name);
                const partNumber = cleanString(rawPart.partNumber);
                const rawModel = cleanString(rawPart.model);
                const model = (isPlausibleCatalogModel(rawModel) ? rawModel : '')
                    || trustedDocumentModel
                    || (models.length === 1 ? models[0] : '')
                    || inferCatalogModelFromFilename(document.filename);
                if (!name || !partNumber || !model) continue;

                const manufacturer = cleanString(rawPart.manufacturer)
                    || document.manufacturer
                    || extractedManufacturer
                    || (/\bKawasaki\b/i.test(document.filename) ? 'Kawasaki' : (/\bKohler\b/i.test(document.filename) ? 'Kohler' : (/\bBriggs\b/i.test(document.filename) ? 'Briggs & Stratton' : 'Husqvarna')));
                const documentPnc = trustedDocumentPnc;
                const extractedPartPnc = normalizeHusqvarnaPnc(cleanString(rawPart.pnc));
                let pnc = extractedPartPnc || documentPnc || '';
                let universalAcrossPnc = Boolean(rawPart.universalAcrossPnc) || isUniversalPnc(pnc);
                // Um catálogo enviado para um PNC específico não comprova que a
                // peça serve em todos os PNCs. O escopo informado no upload tem
                // precedência sobre uma inferência visual genérica da IA.
                if (documentPnc) {
                    pnc = extractedPartPnc || documentPnc;
                    universalAcrossPnc = false;
                }
                if (universalAcrossPnc) pnc = '';

                const section = cleanString(rawPart.section);
                const position = cleanString(rawPart.position);
                const aliases = Array.isArray(rawPart.alternativeNames)
                    ? [...new Set(rawPart.alternativeNames.map(cleanString).filter(Boolean))]
                    : [];
                const page = Number.isInteger(rawPart.page) && rawPart.page > 0 ? rawPart.page : null;
                const notes = cleanString(rawPart.notes);
                const searchText = buildPartRetrievalContext({
                    manufacturer,
                    model,
                    pnc,
                    universalAcrossPnc,
                    section,
                    position,
                    name,
                    alternativeNames: aliases,
                    partNumber,
                    notes,
                }).searchText;

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
                    page: true,
                    embeddingRevision: true,
                },
            });
            const identifiedParts = matchExistingPartIds(
                preparedParts.map((preparedPart) => preparedPart.data),
                existingParts,
            );
            const previousActiveCount = existingParts.filter((part) => part.active).length;
            const previousOccurrenceCount = countDistinctPartOccurrences(existingParts.filter((part) => part.active));
            const nextOccurrenceCount = countDistinctPartOccurrences(preparedParts.map(part => part.data));
            const configuredMinimumRatio = Number(process.env.MIN_REPROCESS_PART_RATIO || '0.5');
            if (!hasSafeExtractionCoverage(previousOccurrenceCount, nextOccurrenceCount, configuredMinimumRatio)) {
                throw new Error(
                    `Reprocessamento interrompido por segurança: a extração retornou ${nextOccurrenceCount} de ${previousOccurrenceCount} ocorrências técnicas anteriormente ativas (${preparedParts.length} de ${previousActiveCount} linhas por aplicação).`,
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
                const existingActiveById = new Map(existingParts.map(part => [part.id, part.active]));
                const persistenceRows = identifiedParts.map(identifiedPart => ({
                    id: identifiedPart.existingId || randomUUID(),
                    existingId: identifiedPart.existingId,
                    data: {
                        ...identifiedPart.item,
                        sourceKey: identifiedPart.sourceKey,
                        // Peças novas só ficam visíveis na troca final. Peças já
                        // ativas permanecem disponíveis durante toda a preparação.
                        active: identifiedPart.existingId ? Boolean(existingActiveById.get(identifiedPart.existingId)) : false,
                        retiredAt: identifiedPart.existingId && existingActiveById.get(identifiedPart.existingId) ? null : new Date(),
                        extractionRevision: revision,
                        embeddingRevision: 0,
                    },
                }));
                activePartIds = persistenceRows.map(row => row.id);

                // Uma única transação com 300–800 upserts excedia o limite de
                // 120 s do Prisma/Render. Lotes independentes mantêm cada lock
                // curto; a publicação dos novos IDs continua atômica logo abaixo.
                const persistenceBatchSize = 60;
                for (let offset = 0; offset < persistenceRows.length; offset += persistenceBatchSize) {
                    const batch = persistenceRows.slice(offset, offset + persistenceBatchSize);
                    const batchIds = batch.map(row => row.id);
                    await prisma.$transaction([
                        ...batch.map(row => row.existingId
                            ? prisma.part.update({ where: { id: row.id }, data: row.data })
                            : prisma.part.create({ data: { id: row.id, ...row.data } })),
                        prisma.$executeRaw`
                            UPDATE "Part" SET "embedding" = NULL, "embeddingRevision" = 0
                            WHERE "id" IN (${Prisma.join(batchIds)})
                        `,
                    ]);
                    console.log(`💾 ${Math.min(offset + batch.length, persistenceRows.length)}/${persistenceRows.length} peças preparadas para persistência.`);
                }

                await prisma.$transaction(async tx => {
                    const activated = await tx.part.updateMany({
                        where: { documentId, id: { in: activePartIds } },
                        data: { active: true, retiredAt: null },
                    });
                    await tx.part.updateMany({
                        where: { documentId, active: true, id: { notIn: activePartIds } },
                        data: { active: false, retiredAt: new Date() },
                    });
                    const documentUpdate = await tx.document.updateMany({
                        where: { id: documentId, processingJobId: jobId },
                        data: {
                            manufacturer: document.manufacturer || extractedManufacturer || null,
                            model: trustedDocumentModel || (models.length === 1 ? models[0] : null),
                            pnc: trustedDocumentPnc || (pncs.length === 1 ? pncs[0] : null),
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
                    if (documentUpdate.count !== 1 || activated.count !== activePartIds.length) throw new Error('STALE_DOCUMENT_JOB');
                }, { maxWait: 10_000, timeout: 30_000 });
                invalidateHomeCountsCache(document.tenantId);
                console.log(`💾 Catálogo já utilizável: ${preparedParts.length} peças salvas na revisão ${revision}.`);
            }

            // A busca lexical bilíngue funciona sem vetores. Em produção, a
            // indisponibilidade/cota da IA nunca deve impedir um PDF já extraído
            // de ficar pronto para o balcão.
            if (!semanticIndexingEnabled()) {
                await updateDocumentForJob(documentId, jobId, {
                    status: 'COMPLETED',
                    processingStage: 'READY',
                    processingCurrent: preparedParts.length,
                    processingTotal: preparedParts.length,
                    processingError: null,
                });
                console.log(`✅ Catálogo ${documentId} pronto pela indexação textual (${preparedParts.length} peças).`);
                return;
            }

            try {
                const revisionRows = await prisma.part.findMany({
                    where: { id: { in: activePartIds } },
                    select: { id: true, embeddingRevision: true },
                });
                const embeddingRevisionById = new Map(revisionRows.map((part) => [part.id, part.embeddingRevision]));
                const allPendingIndexes = activePartIds
                    .map((id, index) => ({ id, index }))
                    .filter(({ id }) => embeddingRevisionById.get(id) !== revision);
                const pendingIndexes = allPendingIndexes.slice(0, semanticPartBudgetPerDocument());
                let indexedCount = preparedParts.length - allPendingIndexes.length;

                await updateDocumentForJob(documentId, jobId, {
                    status: 'COMPLETED',
                    processingStage: 'INDEXING',
                    processingCurrent: indexedCount,
                    processingTotal: Math.max(1, pendingIndexes.length),
                });

                const embeddingAi = ai || await getGeminiClient();
                ai = embeddingAi;
                const batchSize = embeddingBatchSize();
                for (let offset = 0; offset < pendingIndexes.length; offset += batchSize) {
                    const batch = pendingIndexes.slice(offset, offset + batchSize);
                    const embedResult = await withTransientAIRetry(
                        () => embeddingAi.models.embedContent({
                            model: GEMINI_EMBEDDING_MODEL,
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
                            data: { processingCurrent: Math.min(pendingIndexes.length, offset + batch.length), processingTotal: Math.max(1, pendingIndexes.length) },
                        });
                        if (progress.count !== 1) throw new Error('STALE_DOCUMENT_JOB');
                    }, { maxWait: 10_000, timeout: 60_000 });
                    console.log(`🔎 Indexação semântica: ${Math.min(pendingIndexes.length, offset + batch.length)}/${pendingIndexes.length} do orçamento deste catálogo.`);
                }

                await updateDocumentForJob(documentId, jobId, {
                    status: 'COMPLETED',
                    processingStage: 'READY',
                    processingCurrent: preparedParts.length,
                    processingTotal: preparedParts.length,
                    processingError: null,
                });
                if (allPendingIndexes.length > pendingIndexes.length) {
                    console.log(`💰 Índice semântico limitado a ${pendingIndexes.length}/${allPendingIndexes.length} peças; busca textual preservada para todas.`);
                }
            } catch (indexingError) {
                await updateDocumentForJob(documentId, jobId, {
                    status: 'COMPLETED',
                    processingStage: 'READY_WITHOUT_EMBEDDINGS',
                    processingError: readableIndexingWarning(indexingError),
                });
                console.warn(`⚠️ Catálogo ${documentId} pronto sem índice semântico opcional.`, indexingError);
                return;
            }
            console.log(`🏆 Catálogo ${documentId}: revisão ${revision} concluída com ${preparedParts.length} peças ativas.`);
        } catch (error) {
            if (error instanceof Error && error.message === 'STALE_DOCUMENT_JOB') {
                console.warn(`🧹 Trabalho obsoleto do documento ${documentId} foi interrompido.`);
            } else {
                console.error('❌ Erro fatal no AIService:', error);
            }
            throw error;
        } finally {
            if (localFilePath) {
                try {
                    await unlink(localFilePath);
                } catch (error) {
                    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
                    if (code !== 'ENOENT') console.warn('⚠️ Não foi possível remover o arquivo temporário:', error);
                }
            }
            if (uploadedFileName && ai) {
                try {
                    await ai.files.delete({ name: uploadedFileName });
                } catch (error) {
                    console.warn('⚠️ Não foi possível remover arquivo temporário do Gemini:', error);
                }
            }
        }
    }
}
