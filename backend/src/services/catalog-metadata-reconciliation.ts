export function reconciledCatalogModel(input: {
  storedModel?: string | null;
  metadataReviewedAt?: Date | string | null;
  partModels: Array<string | null | undefined>;
}): string | null {
  const stored=(input.storedModel||'').trim();
  if(input.metadataReviewedAt) return stored||null;
  const models=[...new Set(input.partModels.map(value=>(value||'').trim()).filter(Boolean))];
  if(models.length===1) return models[0];
  return stored||null;
}
