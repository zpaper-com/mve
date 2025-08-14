// Common API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Workflow Types
export interface WorkflowSession {
  id: string;
  documentUrl: string;
  status: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
  recipients?: Recipient[];
  attachments?: Attachment[];
}

export interface Recipient {
  id: string;
  sessionId: string;
  orderIndex: number;
  recipientType: RecipientType;
  partyName?: string;
  email?: string;
  mobile?: string;
  npi?: string;
  uniqueUrl: string;
  status: RecipientStatus;
  accessedAt?: Date;
  completedAt?: Date;
  formData?: Record<string, any>;
  createdAt: Date;
}

export interface Attachment {
  id: string;
  sessionId: string;
  recipientId?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  s3Key: string;
  uploadedAt: Date;
  uploadedBy?: string;
}

// Enums - synchronized with Prisma schema
export enum WorkflowStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum RecipientStatus {
  PENDING = 'PENDING',
  NOTIFIED = 'NOTIFIED',
  ACCESSED = 'ACCESSED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export enum RecipientType {
  PRESCRIBER = 'PRESCRIBER',
  PATIENT = 'PATIENT',
  PHARMACY = 'PHARMACY',
  INSURANCE = 'INSURANCE',
  CUSTOM = 'CUSTOM',
}

// Request/Response DTOs
export interface CreateWorkflowRequest {
  recipients: CreateRecipientRequest[];
  metadata?: Record<string, any>;
}

export interface CreateRecipientRequest {
  recipientType: RecipientType;
  partyName?: string;
  email?: string;
  mobile?: string;
  npi?: string;
}

export interface SubmitWorkflowRequest {
  formData: Record<string, any>;
}

export interface WorkflowStatusResponse {
  session: WorkflowSession;
  currentRecipient?: Recipient;
  completedRecipients: Recipient[];
  pendingRecipients: Recipient[];
}

export interface UploadAttachmentRequest {
  sessionId: string;
  recipientId?: string;
}

export interface UploadAttachmentResponse {
  attachment: Attachment;
  uploadUrl: string;
  isMultipart?: boolean;
}

// PDF Types
export interface PDFFormData {
  [fieldName: string]: string | number | boolean;
}

export interface PDFPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  thumbnailUrl?: string;
}

export interface PDFDocumentInfo {
  numPages: number;
  pages: PDFPageInfo[];
  formFields: string[];
  hiddenSignatureFields: string[];
}

// WebSocket Types
export interface SocketData {
  userId?: string;
  sessionId?: string;
  recipientId?: string;
}

export interface WorkflowUpdateEvent {
  type: 'workflow_updated';
  sessionId: string;
  recipientId: string;
  status: RecipientStatus;
  formData?: Record<string, any>;
}

export interface AttachmentUploadEvent {
  type: 'attachment_uploaded';
  sessionId: string;
  attachment: Attachment;
}

import { Request } from 'express';
import { SessionData } from '../middleware/auth';

// Express Request Extensions
export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
    roles?: string[];
    permissions?: string[];
    sessionId?: string;
    csrfToken?: string;
    [key: string]: any;
  };
  session?: SessionData | null;
}

// Database Types (for services)
export interface DatabaseWorkflowSession {
  id: string;
  document_url: string;
  created_at: Date;
  updated_at: Date;
  status: string;
  metadata?: Record<string, any>;
}

export interface DatabaseRecipient {
  id: string;
  session_id: string;
  order_index: number;
  recipient_type: string;
  party_name?: string;
  email?: string;
  mobile?: string;
  npi?: string;
  unique_url: string;
  status: string;
  accessed_at?: Date;
  completed_at?: Date;
  form_data?: Record<string, any>;
  created_at: Date;
}

export interface DatabaseAttachment {
  id: string;
  session_id: string;
  recipient_id?: string;
  file_name: string;
  file_type: string;
  file_size: number;
  s3_key: string;
  uploaded_at: Date;
  uploaded_by?: string;
}

// Utility Types
export type Nullable<T> = T | null;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Error Types
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public errors?: string[]
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, errors?: string[]) {
    super(400, message, errors);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}