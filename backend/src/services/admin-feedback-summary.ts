export type FeedbackLearningLevel = 'COLD_START' | 'LEARNING' | 'ESTABLISHED';

export interface FeedbackReasonCount {
  reason: string | null;
  count: number;
}

export function feedbackLearningStage(uniqueSignals: number): {
  learningLevel: FeedbackLearningLevel;
  nextMilestone: number | null;
} {
  if (uniqueSignals >= 20) {
    return { learningLevel: 'ESTABLISHED', nextMilestone: null };
  }
  if (uniqueSignals >= 5) {
    return { learningLevel: 'LEARNING', nextMilestone: 20 };
  }
  return { learningLevel: 'COLD_START', nextMilestone: 5 };
}

export function feedbackReasonCounts(rows: FeedbackReasonCount[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (!row.reason || !Number.isFinite(row.count) || row.count <= 0) continue;
    counts[row.reason] = Math.trunc(row.count);
  }
  return counts;
}
