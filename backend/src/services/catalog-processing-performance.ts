import { performance } from 'node:perf_hooks';

const MAX_RECENT_JOBS = 120;

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

export function startCatalogProcessing(jobId: string, documentId: string, tenantId: string): void {
  const now = performance.now();
  activeJobs.set(jobId, {
    jobId,
    documentId,
    tenantId,
    startedAt: now,
    startedIso: new Date().toISOString(),
    stage: 'WORKER_START',
    stageStartedAt: now,
    stages: [],
  });
}

export function markCatalogProcessingStage(jobId: string, stage: string): void {
  const job = activeJobs.get(jobId);
  if (!job || !stage || job.stage === stage) return;
  const now = performance.now();
  closeCurrentStage(job, now);
  job.stage = stage;
  job.stageStartedAt = now;
}

export function finishCatalogProcessing(jobId: string, status: string): void {
  const job = activeJobs.get(jobId);
  if (!job) return;
  const now = performance.now();
  closeCurrentStage(job, now);
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

  return {
    active: [...activeJobs.values()].map(job => ({
      jobId: job.jobId,
      documentId: job.documentId,
      tenantId: job.tenantId,
      stage: job.stage,
      elapsedMs: rounded(performance.now() - job.startedAt),
      stageElapsedMs: rounded(performance.now() - job.stageStartedAt),
      startedAt: job.startedIso,
    })),
    stages,
    recent: recentJobs.slice(0, 20),
    retainedJobs: recentJobs.length,
  };
}
