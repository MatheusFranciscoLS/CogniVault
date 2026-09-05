export type Role = 'ADMIN' | 'MECHANIC';
export type Section = 'home' | 'overview' | 'assistant' | 'parts' | 'catalogs' | 'history' | 'favorites' | 'users' | 'feedback' | 'quality' | 'audit';
export type SearchStatus = 'FOUND' | 'PNC_REQUIRED' | 'MODEL_REQUIRED' | 'PART_REQUIRED' | 'AMBIGUOUS' | 'NOT_FOUND';
export type OfficialVerificationState = 'UNVERIFIED' | 'VERIFIED' | 'SUPERSEDED' | 'REVIEW';
export type OfficialVerificationApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type CatalogReviewStatus = 'PENDING' | 'READY' | 'NEEDS_REVIEW' | 'REVIEWED';
export type RetrievalSource = 'DIRECT_CODE' | 'SEMANTIC' | 'LEXICAL' | 'FULL_TEXT' | 'FUZZY';

export interface SessionUser { id:string; email:string; role:Role; status:string; tenant:{id:string;name:string}; }
export interface DocumentItem {
  id:string; filename:string; status:string; manufacturer:string|null; model:string|null; pnc:string|null; pncs?:string[]; category:string; createdAt:string; partCount:number;
  suggestedModel?:string|null; modelNeedsReview?:boolean;
  archivedAt?:string|null; processingActive?:boolean; processingStage?:string; processingCurrent?:number; processingTotal?:number; processingError?:string|null;
  healthScore?:number; reviewStatus?:CatalogReviewStatus; reviewReasons?:string[]; qualityCheckedAt?:string|null; extractionMethod?:string|null;
  applications?:Array<{ machineModel:string; machinePnc?:string; label:string }>;
  engineApplications?:Array<{ engineModel:string; engineArticle?:string; label:string }>;
}
export interface FeedbackOption { id:string; name:string; partNumber:string; model:string; pnc:string|null; section:string|null; position:string|null; notes?:string|null; }
export interface OfficialVerification {
  id:string|null; state:OfficialVerificationState; queriedPartNumber:string; currentPartNumber:string; description:string|null;
  officialUrl:string; note:string|null; verifiedAt:string|null; verifiedBy:string|null; source:'TENANT'|'BUILT_IN'|'NONE';
  cacheState:'FRESH'|'STALE'|'NONE'; freshUntil:string|null;
}
export interface OfficialVerificationSubmission {
  id:string; status:'VERIFIED'|'SUPERSEDED'|'REVIEW'; approvalStatus:OfficialVerificationApprovalStatus;
  queriedPartNumber:string; currentPartNumber:string; description:string|null; officialUrl:string; note:string|null;
  verifiedAt:string; createdAt:string; submittedBy:string; reviewedBy:string|null; reviewedAt:string|null; reviewNote:string|null;
}
export interface ChatResponse {
  status:SearchStatus; answer:string; pncOptions?:string[]; modelOptions?:string[]; serialRequired?:boolean; confidence?:number;
  interpreted?:{partDescription:string;manufacturer:string|null;model:string|null;pnc:string|null;partNumber:string|null};
  match?:{
    method:'DIRECT_CODE'|'SEMANTIC'|'LEXICAL';level:'EXACT'|'HIGH'|'REVIEW';explanation:string;
    evidence?:string[];retrievalSources?:RetrievalSource[];
  };
  technicalContext?:Array<{filename:string;page:number|null;section:string|null;excerpt:string;method:'FULL_TEXT'|'FUZZY'|'SEMANTIC'}>;
  guidance?:{title:string;description:string;tips:string[]};
  part?:{ id:string; documentId:string; partNumber:string; manufacturer?:string|null; name:string; model:string; pnc:string; section:string|null; position:string|null; page:number|null; notes?:string|null; filename:string; universalAcrossPnc?:boolean; applications?:Array<{model:string;pnc:string}> };
  feedbackOptions?:FeedbackOption[]; options?:FeedbackOption[];
  b2bPortal?: { success: boolean; stockStatus: string; supersededBy?: string; };
  technicalReasoningSteps?: Array<{ step: number; title: string; detail: string; status: 'SUCCESS' | 'INFO' | 'NOTICE' }>;
  diagramHighlight?: { documentId: string; filename: string; page: number | null; position: string | null; section: string | null };
}
export interface Overview { tenantName:string; users:number; activeDocuments:number; processingDocuments:number; failedDocuments:number; parts:number; feedbackTotal:number; feedbackAccuracy:number|null; }
export interface AdminUser { id:string; email:string; role:Role; status:'PENDING'|'APPROVED'|'REJECTED'; createdAt:string; feedbackCount:number; }
export interface AuditLog { id:string; action:string; targetType:string; targetId:string|null; metadata:unknown; createdAt:string; user:{email:string}|null; }

export interface SearchHistoryItem {
  id:string; query:string; pnc:string|null; status:SearchStatus; resultPartId:string|null; resultLabel:string|null; resultCode:string|null;
  resultModel:string|null; resultPnc:string|null; sourceFilename:string|null; createdAt:string;
}
export interface FavoriteItem {
  id:string; kind:'PART'|'DOCUMENT'; label:string; reference:string|null; model:string|null; pnc:string|null; partId:string|null; documentId:string|null; createdAt:string;
  sourceFilename?:string|null; section?:string|null; position?:string|null; page?:number|null;
}
export interface SearchPart {
  id:string; name:string; partNumber:string; manufacturer:string|null; model:string; pnc:string|null; section:string|null; position:string|null; page:number|null; documentId:string; filename:string; notes?:string|null;
}
export interface PartDetail extends SearchPart {
  notes:string|null; favoriteId:string|null; document:{id:string;filename:string;manufacturer:string|null;model:string|null;pnc:string|null};
  related:Array<{id:string;name:string;partNumber:string;model:string;pnc:string|null;section:string|null;position:string|null;page:number|null}>;
  compatibility:Array<{model:string;pnc:string|null}>;
}
export interface HomeData {
  counts:{parts:number;documents:number}; recentSearches:SearchHistoryItem[]; favorites:FavoriteItem[];
  recentDocuments:Array<{id:string;filename:string;manufacturer:string|null;model:string|null;pnc:string|null;createdAt:string;partCount:number}>;
}
export interface NotificationItem { id:string; type:'info'|'error'|'processing'|'warning'; title:string; description:string; createdAt:string; }
export interface AdminFeedback {
  id:string; query:string; correct:boolean; reason:string|null; pnc:string|null; createdAt:string; user:{id:string;email:string}|null;
  resultPart:{name:string;partNumber:string;model:string}|null; correctedPart:{name:string;partNumber:string;model:string}|null;
}

export interface QualityCatalog {
  id:string; filename:string; manufacturer:string|null; model:string|null; pnc:string|null; status:string; processingStage:string; processingError:string|null;
  extractionMethod:string|null; extractedAt:string|null; healthScore:number; reviewStatus:CatalogReviewStatus; reviewReasons:string[];
  qualityCheckedAt:string|null; metadataReviewedAt:string|null; category:{name:string}|null; _count:{parts:number;chunks:number};
  suggestedModel?:string|null; modelNeedsReview?:boolean;
}
export interface SearchRadarItem {
  query:string; pnc:string|null; model:string|null; partDescription:string|null;
  status:Exclude<SearchStatus,'FOUND'>; count:number; lastSeen:string;
}
export interface BenchmarkMetrics {
  total:number; top1Accuracy:number; recallAt5:number; mrr:number; ndcgAt5:number; missRate:number;
  hardNegativeCases:number; hardNegativeTop1Rate:number; hardNegativeWinRate:number;
  top1Percent:number; recallAt5Percent:number; missPercent:number; hardNegativeWinPercent:number;
  goldenTotal:number; goldenApplicable:number; feedbackCases:number; catalogCoveragePercent:number; extractionGaps:number; missingCatalogs:number;
}
export interface BenchmarkRun { id:string; caseCount:number; metrics:BenchmarkMetrics; details:unknown; createdAt:string; }
export interface AiQualityData {
  summary:{catalogs:number;readyCatalogs:number;needsReview:number;averageHealth:number;parts:number;technicalMemoryChunks:number;partsWithoutEmbedding:number;partsWithoutPage:number;partsWithoutSection:number;modelIssues:number;catalogsWithoutConfirmedPnc:number};
  runtime:{generativeModel:string;extraction:{geminiCatalogs:number;parserCatalogs:number;unknownCatalogs:number}};
  learning:{total:number;uniqueSignals:number;positive:number;corrected:number;negativeWithoutCorrection:number;level:'COLD_START'|'LEARNING'|'ESTABLISHED';nextMilestone:number|null};
  semanticIndex:{enabled:boolean;indexedParts:number;totalParts:number;indexedChunks:number;totalChunks:number;batchLimit:number;runsToday:number;dailyRuns:number;canRun:boolean};
  visualRetry:{candidates:number;eligible:number;coolingDown:number;cooldownHours:number;documents:Array<{id:string;filename:string}>};
  officialVerification:{approved:number;pending:number;stale:number;cacheDays:number};
  searchRadar:SearchRadarItem[]; reviewQueue:QualityCatalog[]; catalogs:QualityCatalog[];
  hygiene:{archivedRecords:number;removedHistoricalRecords:number;legacyEmptyRecords:number;note:string}; benchmarkRuns:BenchmarkRun[];
}
