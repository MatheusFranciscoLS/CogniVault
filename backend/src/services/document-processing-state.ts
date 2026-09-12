export function isDocumentBusy(status: string, processingJobId?: string | null): boolean {
  if (status === 'FAILED') return false;
  return Boolean(processingJobId) || status === 'PENDING' || status === 'PROCESSING';
}
