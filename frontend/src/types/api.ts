// Base API Response types
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  success: boolean;
  timestamp?: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ErrorResponse {
  message: string;
  code?: string;
  details?: Record<string, any>;
  timestamp: string;
}

// User and Authentication types
export interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  roles: string[];
  permissions: string[];
  emailVerified: boolean;
  createdAt: string;
  updatedAt?: string;
  lastLogin?: string;
  metadata?: Record<string, any>;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  acceptTerms: boolean;
}

// Workflow types
export interface WorkflowRecipient {
  id?: string;
  type: 'provider' | 'patient' | 'admin';
  name: string;
  email: string;
  mobile?: string;
  npi?: string;
  orderIndex: number;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  uniqueUrl?: string;
  notifiedAt?: string;
  completedAt?: string;
  formData?: Record<string, any>;
}

export interface WorkflowSession {
  id: string;
  documentUrl: string;
  documentName?: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled' | 'expired';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  completedAt?: string;
  recipients: WorkflowRecipient[];
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface CreateWorkflowRequest {
  documentUrl: string;
  documentName?: string;
  recipients: Omit<WorkflowRecipient, 'id' | 'status' | 'uniqueUrl' | 'notifiedAt' | 'completedAt'>[];
  expiresIn?: number; // hours
  sendNotifications?: boolean;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface WorkflowResponse {
  sessionId: string;
  uniqueUrls: Array<{
    recipientId: string;
    uniqueUrl: string;
  }>;
}

// PDF types
export interface PDFDocument {
  id: string;
  sessionId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  thumbnailUrl?: string;
  pageCount: number;
  formFields?: PDFFormField[];
  uploadedAt: string;
  uploadedBy: string;
}

// Enhanced PDF.js type definitions
export interface PDFViewerState {
  currentPage: number;
  totalPages: number;
  zoomLevel: number;
  showThumbnails: boolean;
  pdfDocument: any | null;
  isLoading: boolean;
  error: string | null;
  formData: PDFFormData;
  annotations: PDFAnnotation[];
  pageRotations: Record<number, number>;
}

export interface PDFRenderOptions {
  scale: number;
  rotation?: number;
  background?: string;
  enableTextLayer?: boolean;
  enableAnnotationLayer?: boolean;
  normalizeWhitespace?: boolean;
  disableFontFace?: boolean;
}

export interface PDFPageInfo {
  pageNumber: number;
  viewport: {
    width: number;
    height: number;
    scale: number;
    rotation: number;
  };
  renderingState: 'idle' | 'rendering' | 'completed' | 'error';
  annotations?: PDFAnnotation[];
  textContent?: PDFTextContent;
}

export interface PDFTextContent {
  items: Array<{
    str: string;
    dir: string;
    width: number;
    height: number;
    transform: number[];
    fontName: string;
    hasEOL: boolean;
  }>;
  styles: Record<string, any>;
}

export interface PDFAnnotation {
  id: string;
  subtype: string;
  fieldType?: 'Tx' | 'Ch' | 'Btn' | 'Sig';
  fieldName?: string;
  fieldValue?: any;
  rect: [number, number, number, number];
  page: number;
  required?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  options?: string[];
  defaultValue?: any;
  multiline?: boolean;
  password?: boolean;
  richText?: boolean;
  maxLength?: number;
  validation?: {
    pattern?: string;
    format?: string;
    range?: [number, number];
  };
}

export interface PDFFormField {
  name: string;
  type: 'text' | 'textarea' | 'checkbox' | 'radio' | 'select' | 'signature' | 'date' | 'button';
  value?: any;
  required?: boolean;
  readonly?: boolean;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  options?: string[]; // for select/radio fields
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    format?: 'email' | 'phone' | 'date' | 'number' | 'currency';
  };
  appearance?: {
    backgroundColor?: string;
    borderColor?: string;
    textColor?: string;
    fontSize?: number;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
  };
  events?: {
    onFocus?: string;
    onBlur?: string;
    onChange?: string;
    onMouseEnter?: string;
    onMouseLeave?: string;
  };
}

export interface PDFFormData {
  [fieldName: string]: any;
}

// PDF Viewer Configuration
export interface PDFViewerConfig {
  // Rendering settings
  enableTextLayer: boolean;
  enableAnnotationLayer: boolean;
  enableScripting: boolean;
  renderInteractiveForms: boolean;
  disableFontFace: boolean;
  useOnlyCssZoom: boolean;
  
  // Performance settings
  maxCanvasPixels: number;
  cacheSize: number;
  prefetchPages: number;
  
  // Security settings
  disableAutoFetch: boolean;
  disableStream: boolean;
  disableRange: boolean;
  
  // UI settings
  defaultZoomLevel: number;
  minZoomLevel: number;
  maxZoomLevel: number;
  zoomStep: number;
  showThumbnails: boolean;
  thumbnailWidth: number;
  
  // Form settings
  hideSignatureFields: boolean;
  readonly: boolean;
  validateFields: boolean;
  autoSave: boolean;
  saveDebounceMs: number;
}

// PDF Cache Management
export interface PDFCacheEntry {
  pageNumber: number;
  scale: number;
  canvas: HTMLCanvasElement;
  timestamp: number;
  size: number; // memory size estimate
}

export interface PDFCacheManager {
  maxSize: number;
  currentSize: number;
  entries: Map<string, PDFCacheEntry>;
  get: (key: string) => PDFCacheEntry | null;
  set: (key: string, entry: PDFCacheEntry) => void;
  clear: () => void;
  cleanup: () => void;
}

// Attachment types
export interface Attachment {
  id: string;
  sessionId: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  thumbnailUrl?: string;
  uploadedAt: string;
  uploadedBy: string;
  metadata?: Record<string, any>;
}

export interface UploadResponse {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  thumbnailUrl?: string;
}

export interface PresignedUploadResponse {
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
}

// Component prop types
export interface BaseComponentProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export interface LoadingProps {
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
}

export interface ErrorProps {
  error?: Error | string | null;
  errorFallback?: React.ComponentType<{ error: Error; retry?: () => void }>;
}

// Query and mutation types
export interface QueryOptions {
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean;
  retry?: boolean | number;
}

// Search and filter types
export interface SearchParams {
  query?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

export interface WorkflowFilters {
  status?: WorkflowSession['status'][];
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
  recipientEmail?: string;
  tags?: string[];
}