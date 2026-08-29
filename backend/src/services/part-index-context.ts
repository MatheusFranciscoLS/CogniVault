import { inferEquipmentFamily } from './husqvarna-domain-knowledge';
import { inferredSearchAliases } from './part-vocabulary';

export const PART_RETRIEVAL_CONTEXT_VERSION = 2;

export type PartRetrievalContextInput = {
  manufacturer?: string | null;
  model: string;
  pnc?: string | null;
  universalAcrossPnc?: boolean;
  section?: string | null;
  position?: string | null;
  name: string;
  alternativeNames?: string[];
  partNumber: string;
  notes?: string | null;
};

export type PartRetrievalContext = {
  family: ReturnType<typeof inferEquipmentFamily>;
  inferredAliases: string[];
  searchText: string;
};

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase('pt-BR');
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * Monta o texto usado pela recuperação lexical e pelos embeddings.
 *
 * Importante: termos inferidos servem SOMENTE para recuperação. Eles nunca são
 * gravados como nome oficial, Part Number, PNC ou aplicação da peça. A evidência
 * oficial continua sendo a linha extraída do catálogo.
 */
export function buildPartRetrievalContext(input: PartRetrievalContextInput): PartRetrievalContext {
  const manufacturer = clean(input.manufacturer);
  const model = clean(input.model);
  const pnc = clean(input.pnc);
  const section = clean(input.section);
  const position = clean(input.position);
  const name = clean(input.name);
  const partNumber = clean(input.partNumber);
  const notes = clean(input.notes);
  const officialAliases = unique(input.alternativeNames || []);
  const family = inferEquipmentFamily('', model);

  const inferredAliases = unique(
    inferredSearchAliases(name, section, officialAliases, model)
      .filter(alias => !officialAliases.some(official => official.toLocaleLowerCase('pt-BR') === alias.toLocaleLowerCase('pt-BR'))),
  ).slice(0, 80);

  const searchText = [
    `Contexto de recuperação v${PART_RETRIEVAL_CONTEXT_VERSION}`,
    manufacturer ? `Fabricante: ${manufacturer}` : '',
    family ? `Família técnica: ${family}` : '',
    `Modelo: ${model}`,
    input.universalAcrossPnc ? 'Escopo PNC: explicitamente universal no catálogo' : (pnc ? `PNC: ${pnc}` : ''),
    section ? `Vista / conjunto: ${section}` : '',
    position ? `Posição na vista: ${position}` : '',
    `Peça oficial do catálogo: ${name}`,
    officialAliases.length ? `Nomes alternativos presentes no catálogo: ${officialAliases.join(', ')}` : '',
    inferredAliases.length ? `Termos inferidos somente para recuperação: ${inferredAliases.join(', ')}` : '',
    `Part Number oficial: ${partNumber}`,
    notes ? `Observações do catálogo: ${notes}` : '',
  ].filter(Boolean).join('\n');

  return { family, inferredAliases, searchText };
}
