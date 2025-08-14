/**
 * PDF.js TypeScript type definitions and enhancements
 * 
 * This file provides comprehensive type definitions for PDF.js integration,
 * form handling, and viewer state management.
 */

import type { 
  PDFDocumentProxy, 
  PDFPageProxy, 
  AnnotationData,
  PageViewport,
  RenderTask,
  TextContent,
  DocumentInitParameters
} from 'pdfjs-dist';

// Re-export core PDF.js types
export type {
  PDFDocumentProxy,
  PDFPageProxy,
  AnnotationData,
  PageViewport,
  RenderTask,
  TextContent,
  DocumentInitParameters
};

// Enhanced PDF Viewer Types
export interface PDFViewerProps {
  pdfUrl: string;
  config?: Partial<PDFViewerConfig>;
  onLoad?: (document: PDFDocumentProxy) => void;
  onError?: (error: Error) => void;
  onPageChange?: (pageNumber: number) => void;
  onZoomChange?: (zoomLevel: number) => void;
  onFormDataChange?: (formData: PDFFormData) => void;
}

export interface PDFViewerConfig {
  // Core PDF.js settings
  pdfWorkerSrc: string;
  cMapUrl: string;
  cMapPacked: boolean;
  enableScripting: boolean;
  renderInteractiveForms: boolean;
  disableFontFace: boolean;
  useOnlyCssZoom: boolean;
  
  // Performance settings
  maxCanvasPixels: number;
  canvasMaxAreaInBytes: number;
  cacheSize: number;
  prefetchPages: number;
  renderingDelay: number;
  
  // Security settings
  disableAutoFetch: boolean;
  disableStream: boolean;
  disableRange: boolean;
  stopAtErrors: boolean;
  
  // UI settings
  defaultZoomLevel: number;
  minZoomLevel: number;
  maxZoomLevel: number;
  zoomStep: number;
  showThumbnails: boolean;
  thumbnailWidth: number;
  thumbnailScale: number;
  
  // Form settings
  hideSignatureFields: boolean;
  readonly: boolean;
  validateFields: boolean;
  autoSave: boolean;
  saveDebounceMs: number;
  
  // Accessibility
  enableA11y: boolean;
  textLayerMode: 0 | 1 | 2; // 0=disabled, 1=enabled, 2=enhanced
  
  // Development
  verbosity: 0 | 1 | 2 | 3 | 4 | 5;
  debugMode: boolean;
}

// Default configuration
export const DEFAULT_PDF_CONFIG: PDFViewerConfig = {
  // PDF.js core
  pdfWorkerSrc: '/pdf.worker.min.js',
  cMapUrl: '/cmaps/',
  cMapPacked: true,
  enableScripting: false, // Security: disable JS execution
  renderInteractiveForms: true,
  disableFontFace: false,
  useOnlyCssZoom: false,
  
  // Performance
  maxCanvasPixels: 16777216, // 4096x4096
  canvasMaxAreaInBytes: 268435456, // 256MB
  cacheSize: 10,
  prefetchPages: 2,
  renderingDelay: 100,
  
  // Security
  disableAutoFetch: false,
  disableStream: false,
  disableRange: false,
  stopAtErrors: false,
  
  // UI
  defaultZoomLevel: 100,
  minZoomLevel: 25,
  maxZoomLevel: 400,
  zoomStep: 25,
  showThumbnails: true,
  thumbnailWidth: 150,
  thumbnailScale: 0.3,
  
  // Forms
  hideSignatureFields: true, // MVE requirement
  readonly: false,
  validateFields: true,
  autoSave: true,
  saveDebounceMs: 500,
  
  // Accessibility
  enableA11y: true,
  textLayerMode: 1,
  
  // Development
  verbosity: 1,
  debugMode: false,
};

// Enhanced form field types
export interface PDFFormField {
  id: string;
  name: string;
  type: PDFFormFieldType;
  subtype?: string;
  value?: any;
  defaultValue?: any;
  required?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  page: number;
  rect: [number, number, number, number]; // [x1, y1, x2, y2]
  transform?: number[]; // 6-element transform matrix
  
  // Field-specific properties
  multiline?: boolean;
  password?: boolean;
  richText?: boolean;
  maxLength?: number;
  options?: PDFFormFieldOption[];
  
  // Validation
  validation?: PDFFormFieldValidation;
  
  // Appearance
  appearance?: PDFFormFieldAppearance;
  
  // Events (for non-security contexts)
  events?: PDFFormFieldEvents;
  
  // Calculated fields
  calculate?: string;
  format?: string;
  
  // Export/import
  exportValue?: any;
  alternateFieldName?: string;
  mappingName?: string;
}

export type PDFFormFieldType = 
  | 'text'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'listbox'
  | 'signature'
  | 'button'
  | 'date'
  | 'file';

export interface PDFFormFieldOption {
  value: string;
  label: string;
  selected?: boolean;
  disabled?: boolean;
}

export interface PDFFormFieldValidation {
  required?: boolean;
  pattern?: RegExp | string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  format?: 'email' | 'phone' | 'date' | 'number' | 'currency' | 'ssn' | 'zip';
  custom?: (value: any) => boolean | string;
}

export interface PDFFormFieldAppearance {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: 'normal' | 'bold' | 'italic' | 'bold italic';
  textAlign?: 'left' | 'center' | 'right';
  borderStyle?: 'solid' | 'dashed' | 'beveled' | 'inset' | 'underline';
}

export interface PDFFormFieldEvents {
  onFocus?: (field: PDFFormField, value: any) => void;
  onBlur?: (field: PDFFormField, value: any) => void;
  onChange?: (field: PDFFormField, value: any) => void;
  onValidate?: (field: PDFFormField, value: any) => boolean | string;
  onCalculate?: (field: PDFFormField) => any;
}

// Form data and validation
export interface PDFFormData {
  [fieldName: string]: any;
}

export interface PDFFormValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
  completionPercentage: number;
  requiredFieldsCompleted: number;
  totalRequiredFields: number;
}

// Page rendering and caching
export interface PDFPageRenderInfo {
  pageNumber: number;
  scale: number;
  rotation: number;
  viewport: PageViewport;
  canvas: HTMLCanvasElement;
  renderTask?: RenderTask;
  timestamp: number;
  memorySize: number;
}

export interface PDFRenderOptions {
  scale: number;
  rotation?: number;
  background?: string;
  intent?: 'display' | 'print';
  enableTextLayer?: boolean;
  enableAnnotationLayer?: boolean;
  canvasContext?: CanvasRenderingContext2D;
  transform?: number[];
  viewport?: PageViewport;
}

// Thumbnail management
export interface PDFThumbnail {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  imageData?: string;
  width: number;
  height: number;
  scale: number;
  timestamp: number;
}

// Search and navigation
export interface PDFSearchOptions {
  query: string;
  caseSensitive?: boolean;
  wholeWords?: boolean;
  highlightAll?: boolean;
  findPrevious?: boolean;
}

export interface PDFSearchResult {
  pageNumber: number;
  matches: Array<{
    begin: number;
    end: number;
    text: string;
    rect: [number, number, number, number];
  }>;
}

// Error handling
export interface PDFError {
  name: string;
  message: string;
  details?: any;
  stack?: string;
  recoverable?: boolean;
}

export type PDFErrorType = 
  | 'LoadingError'
  | 'RenderingError' 
  | 'FormError'
  | 'SecurityError'
  | 'ValidationError'
  | 'NetworkError'
  | 'MemoryError';

// Events
export interface PDFViewerEvents {
  onDocumentLoad: (document: PDFDocumentProxy) => void;
  onDocumentError: (error: PDFError) => void;
  onPageChange: (pageNumber: number) => void;
  onZoomChange: (zoomLevel: number) => void;
  onRotationChange: (rotation: number) => void;
  onFormFieldChange: (fieldName: string, value: any, field: PDFFormField) => void;
  onFormValidation: (result: PDFFormValidationResult) => void;
  onAnnotationClick: (annotation: AnnotationData, pageNumber: number) => void;
  onTextSelection: (text: string, pageNumber: number) => void;
  onSearchResult: (results: PDFSearchResult[]) => void;
  onRenderProgress: (pageNumber: number, progress: number) => void;
  onMemoryWarning: (usage: number, limit: number) => void;
}

// Utility types
export type PDFViewerMode = 'view' | 'form' | 'signature' | 'annotation';
export type PDFZoomMode = 'auto' | 'page-fit' | 'page-width' | 'page-height' | 'custom';
export type PDFRenderingState = 'idle' | 'loading' | 'rendering' | 'completed' | 'error';
export type PDFLoadingState = 'idle' | 'loading' | 'loaded' | 'error';

// Advanced features
export interface PDFAnnotationLayer {
  annotations: AnnotationData[];
  div: HTMLDivElement;
  page: PDFPageProxy;
  viewport: PageViewport;
  linkService?: any;
  renderForms?: boolean;
}

export interface PDFTextLayer {
  textContent: TextContent;
  textDivs: HTMLElement[];
  textLayerDiv: HTMLDivElement;
  viewport: PageViewport;
  enhanceTextSelection?: boolean;
}

// Memory management
export interface PDFMemoryStats {
  totalMemory: number;
  usedMemory: number;
  cacheSize: number;
  pageCount: number;
  renderedPages: number;
  activeTasks: number;
}

// Worker and threading
export interface PDFWorkerConfig {
  src: string;
  verbosity: number;
  maxIdleTime: number;
  port?: MessagePort;
}

// Export utilities
export interface PDFExportOptions {
  format: 'pdf' | 'png' | 'jpeg' | 'svg';
  quality?: number; // for jpeg
  scale?: number;
  pages?: number[]; // specific pages to export
  annotations?: boolean;
  forms?: boolean;
}