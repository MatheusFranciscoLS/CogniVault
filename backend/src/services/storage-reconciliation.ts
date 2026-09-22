export type StorageDocumentReference = {
  tenantId: string;
  documentId: string;
  storagePath: string | null;
};

export type StorageObjectReference = {
  tenantId: string;
  path: string;
};

export function documentStoragePaths(reference: StorageDocumentReference): string[] {
  return [...new Set(
    [reference.storagePath, `${reference.tenantId}/${reference.documentId}.pdf`, `${reference.documentId}.pdf`]
      .filter((path): path is string => Boolean(path)),
  )];
}

export function findOrphanStorageObjects(
  documents: StorageDocumentReference[],
  objects: StorageObjectReference[],
): StorageObjectReference[] {
  const known = new Set(
    documents.flatMap(document => documentStoragePaths(document)),
  );

  return objects.filter(object => !known.has(object.path));
}
