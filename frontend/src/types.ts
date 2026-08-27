export type Role = 'ADMIN' | 'MECHANIC';
export type Section = 'overview' | 'assistant' | 'catalogs' | 'users' | 'audit';
export type SearchStatus = 'FOUND' | 'PNC_REQUIRED' | 'MODEL_REQUIRED' | 'AMBIGUOUS' | 'NOT_FOUND';
export interface SessionUser { id:string; email:string; role:Role; status:string; tenant:{id:string;name:string}; }
export interface DocumentItem { id:string; filename:string; status:string; manufacturer:string|null; model:string|null; pnc:string|null; createdAt:string; partCount:number; archivedAt?:string|null; }
export interface FeedbackOption { id:string; name:string; model:string; pnc:string|null; section:string|null; position:string|null; }
export interface ChatResponse {
  status:SearchStatus; answer:string; pncOptions?:string[]; modelOptions?:string[]; confidence?:number;
  part?:{ id:string; documentId:string; partNumber:string; name:string; model:string; pnc:string; section:string|null; position:string|null; page:number|null; filename:string };
  feedbackOptions?:FeedbackOption[]; options?:FeedbackOption[];
}
export interface Overview { tenantName:string; users:number; activeDocuments:number; processingDocuments:number; failedDocuments:number; parts:number; feedbackTotal:number; feedbackAccuracy:number|null; }
export interface AdminUser { id:string; email:string; role:Role; status:'PENDING'|'APPROVED'|'REJECTED'; createdAt:string; feedbackCount:number; }
export interface AuditLog { id:string; action:string; targetType:string; targetId:string|null; metadata:unknown; createdAt:string; user:{email:string}|null; }
