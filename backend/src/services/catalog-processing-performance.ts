import { performance } from 'node:perf_hooks';

const MAX_RECENT_JOBS = 120;
const TERMINAL_STAGES = new Set(['READY', 'READY_WITHOUT_EMBEDDINGS', 'READY_WITH_WARNING', 'FAILED']);

type StageSample = {
  stage: string;
  durationMs: number;
};

type ActiveJob = {
  jobId: string;
  documentId: string;
  tenantId: string;
  startedAt: number;
  startedIso: string;
  stage: string;
  stageStartedAt: number;
  stages: StageSample[];
};

type RecentJob = {
  jobId: string;
  documentId: string;
  tenantId: string;
  status: string;
  startedAt: string;
  completedAt: string;
  totalMs: number;
  stages: StageSample[];
};

type ProcessingMetadata = {
  documentId?: string;
  tenantId?: string;
};

const activeJobs = new Map<string, ActiveJob>();
const recentJobs: RecentJob[] = [];

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function closeCurrentStage(job: ActiveJob, now: number): void {
  const durationMs = Math.max(0, now - job.stageStartedAt);
  if (job.stage) job.stages.push({ stage: job.stage, durationMs: rounded(durationMs) });
}

function createActiveJob(jobId: string, stage: string, metadata: ProcessingMetadata): ActiveJob {
  const now = performance.now();
  return {
    jobId,
    documentId: metadata.documentId || 'unknown',
    tenantId: metadata.tenantId || 'unknown',
    startedAt: now,
    startedIso: new Date().toISOString(),
    stage,
    stageStartedAt: now,
    stages: [],
  };
}

export function startCatalogProcessing(jobId: string, documentId: string, tenantId: string): void {
  if (!jobId || activeJobs.has(jobId)) return;
  activeJobs.set(jobId, createActiveJob(jobId, 'WORKER_START', { documentId, tenantId }));
}

export function markCatalogProcessingStage(
  jobId: string,
  stage: string,
  metadata: ProcessingMetadata = {},
): void {
  if (!jobId || !stage) return;

  let job = activeJobs.get(jobId);
  if (!job) {
    job = createActiveJob(jobId, stage, metadata);
    activeJobs.set(jobId, job);
  } else if (job.stage !== stage) {
    const now = performance.now();
    closeCurrentStage(job, now);
    job.stage = stage;
    job.stageStartedAt = now;
    if (job.documentId === 'unknown' && metadata.documentId) job.documentId = metadata.documentId;
    if (job.tenantId === 'unknown' && metadata.tenantId) job.tenantId = metadata.tenantId;
  }

  if (TERMINAL_STAGES.has(stage)) finishCatalogProcessing(jobId, stage, false);
}

export function finishCatalogProcessing(jobId: string, status: string, closeStage = true): void {
  const job = activeJobs.get(jobId);
  if (!job) return;
  const now = performance.now();
  if (closeStage) closeCurrentStage(job, now);
  activeJobs.delete(jobId);

  recentJobs.unshift({
    jobId: job.jobId,
    documentId: job.documentId,
    tenantId: job.tenantId,
    status,
    startedAt: job.startedIso,
    completedAt: new Date().toISOString(),
    totalMs: rounded(now - job.startedAt),
    stages: job.stages,
  });
  if (recentJobs.length > MAX_RECENT_JOBS) recentJobs.length = MAX_RECENT_JOBS;
}

export function catalogProcessingPerformanceSnapshot() {
  const stageValues = new Map<string, number[]>();
  for (const job of recentJobs) {
    for (const sample of job.stages) {
      const values = stageValues.get(sample.stage) || [];
      values.push(sample.durationMs);
      stageValues.set(sample.stage, values);
    }
  }

  const stages = [...stageValues.entries()].map(([stage, values]) => {
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      stage,
      samples: values.length,
      avgMs: rounded(total / values.length),
      p95Ms: rounded(percentile(values, 0.95)),
      maxMs: rounded(Math.max(...values)),
    };
  }).sort((a, b) => b.p95Ms - a.p95Ms);

  const now = performance.now();
  return {
    active: [...activeJobs.values()].map(job => ({
      jobId: job.jobId,
      documentId: job.documentId,
      tenantId: job.tenantId,
      stage: job.stage,
      elapsedMs: rounded(now - job.startedAt),
      stageElapsedMs: rounded(now - job.stageStartedAt),
      startedAt: job.startedIso,
    })),
    stages,
    recent: recentJobs.slice(0, 20),
    retainedJobs: recentJobs.length,
  };
}
