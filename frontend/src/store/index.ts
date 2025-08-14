import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { 
  PDFDocumentProxy, 
  PDFPageProxy, 
  AnnotationData 
} from 'pdfjs-dist';
import type { 
  PDFViewerConfig, 
  PDFFormField, 
  PDFFormData, 
  PDFFormValidationResult,
  PDFRenderingState,
  PDFMemoryStats,
  PDFError,
  // DEFAULT_PDF_CONFIG
} from '../types/pdf';

// Enhanced PDF Viewer State
interface PDFState {
  // Document state
  currentPage: number;
  totalPages: number;
  pdfDocument: PDFDocumentProxy | null;
  isLoading: boolean;
  error: PDFError | string | null;
  loadingProgress: number;
  
  // View state
  zoomLevel: number;
  zoomMode: 'auto' | 'page-fit' | 'page-width' | 'custom';
  rotation: number;
  showThumbnails: boolean;
  thumbnailWidth: number;
  
  // Form state
  formFields: PDFFormField[];
  formData: PDFFormData;
  formValidation: PDFFormValidationResult | null;
  isDirty: boolean;
  autoSaveEnabled: boolean;
  
  // Rendering state
  renderingStates: Record<number, PDFRenderingState>;
  pageCache: Map<string, any>;
  thumbnailCache: Map<number, string>;
  
  // Configuration
  config: PDFViewerConfig;
  
  // Performance
  memoryStats: PDFMemoryStats;
  maxCacheSize: number;
  
  // UI state
  selectedText: string;
  searchQuery: string;
  searchResults: any[];
  fullscreen: boolean;
}

interface PDFActions {
  // Document actions
  setCurrentPage: (page: number) => void;
  setTotalPages: (pages: number) => void;
  setPdfDocument: (doc: PDFDocumentProxy | null) => void;
  setLoading: (loading: boolean) => void;
  setLoadingProgress: (progress: number) => void;
  setError: (error: PDFError | string | null) => void;
  
  // View actions
  setZoomLevel: (zoom: number) => void;
  setZoomMode: (mode: 'auto' | 'page-fit' | 'page-width' | 'custom') => void;
  setRotation: (rotation: number) => void;
  toggleThumbnails: () => void;
  setThumbnailWidth: (width: number) => void;
  
  // Form actions
  setFormFields: (fields: PDFFormField[]) => void;
  updateFormField: (fieldName: string, value: any) => void;
  setFormData: (data: PDFFormData) => void;
  setFormValidation: (validation: PDFFormValidationResult) => void;
  setDirty: (dirty: boolean) => void;
  toggleAutoSave: () => void;
  validateForm: () => PDFFormValidationResult;
  resetForm: () => void;
  
  // Rendering actions
  setPageRenderingState: (page: number, state: PDFRenderingState) => void;
  cachePageRender: (key: string, data: any) => void;
  cacheThumbnail: (page: number, imageData: string) => void;
  clearCache: () => void;
  
  // Configuration
  updateConfig: (config: Partial<PDFViewerConfig>) => void;
  
  // Performance
  updateMemoryStats: (stats: Partial<PDFMemoryStats>) => void;
  
  // UI actions
  setSelectedText: (text: string) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: any[]) => void;
  toggleFullscreen: () => void;
  
  // Utility actions
  resetPDF: () => void;
  cleanup: () => void;
}

const initialPDFState: PDFState = {
  // Document state
  currentPage: 1,
  totalPages: 0,
  pdfDocument: null,
  isLoading: false,
  error: null,
  loadingProgress: 0,
  
  // View state
  zoomLevel: 100,
  zoomMode: 'custom',
  rotation: 0,
  showThumbnails: true,
  thumbnailWidth: 150,
  
  // Form state
  formFields: [],
  formData: {},
  formValidation: null,
  isDirty: false,
  autoSaveEnabled: true,
  
  // Rendering state
  renderingStates: {},
  pageCache: new Map(),
  thumbnailCache: new Map(),
  
  // Configuration
  config: {
    // Basic config to avoid import issues
    enableScripting: false,
    hideSignatureFields: true,
    autoSave: true,
    saveDebounceMs: 500,
    defaultZoomLevel: 100,
    minZoomLevel: 25,
    maxZoomLevel: 400,
    zoomStep: 25,
    maxCanvasPixels: 16777216,
    cacheSize: 20,
    prefetchPages: 3,
    verbosity: 1,
  } as PDFViewerConfig,
  
  // Performance
  memoryStats: {
    totalMemory: 0,
    usedMemory: 0,
    cacheSize: 0,
    pageCount: 0,
    renderedPages: 0,
    activeTasks: 0,
  },
  maxCacheSize: 50 * 1024 * 1024, // 50MB
  
  // UI state
  selectedText: '',
  searchQuery: '',
  searchResults: [],
  fullscreen: false,
};

export const usePDFStore = create<PDFState & PDFActions>()(
  devtools(
    (set, get) => ({
      ...initialPDFState,
      
      // Document actions
      setCurrentPage: (page) => {
        const { totalPages } = get();
        if (page >= 1 && page <= totalPages) {
          set({ currentPage: page });
        }
      },
      
      setTotalPages: (pages) => set({ totalPages: pages }),
      
      setPdfDocument: (doc) => {
        set({ 
          pdfDocument: doc,
          totalPages: doc?.numPages || 0,
          currentPage: doc ? 1 : 0,
          error: null
        });
      },
      
      setLoading: (loading) => set({ isLoading: loading }),
      
      setLoadingProgress: (progress) => set({ loadingProgress: Math.max(0, Math.min(100, progress)) }),
      
      setError: (error) => set({ error }),
      
      // View actions
      setZoomLevel: (zoom) => {
        const { config } = get();
        const clampedZoom = Math.max(config.minZoomLevel, Math.min(config.maxZoomLevel, zoom));
        set({ zoomLevel: clampedZoom, zoomMode: 'custom' });
      },
      
      setZoomMode: (mode) => {
        set({ zoomMode: mode });
        // Auto-calculate zoom based on mode
        if (mode === 'page-fit') {
          set({ zoomLevel: 100 }); // This should be calculated based on container size
        } else if (mode === 'page-width') {
          set({ zoomLevel: 100 }); // This should be calculated based on container width
        }
      },
      
      setRotation: (rotation) => set({ rotation: rotation % 360 }),
      
      toggleThumbnails: () => set((state) => ({ showThumbnails: !state.showThumbnails })),
      
      setThumbnailWidth: (width) => set({ thumbnailWidth: Math.max(100, Math.min(300, width)) }),
      
      // Form actions
      setFormFields: (fields) => set({ formFields: fields }),
      
      updateFormField: (fieldName, value) => {
        const { formData, formFields } = get();
        const field = formFields.find(f => f.name === fieldName);
        
        if (field) {
          const newFormData = { ...formData, [fieldName]: value };
          set({ 
            formData: newFormData, 
            isDirty: true 
          });
          
          // Auto-validate if enabled
          const validation = get().validateForm();
          set({ formValidation: validation });
        }
      },
      
      setFormData: (data) => set({ formData: data, isDirty: true }),
      
      setFormValidation: (validation) => set({ formValidation: validation }),
      
      setDirty: (dirty) => set({ isDirty: dirty }),
      
      toggleAutoSave: () => set((state) => ({ autoSaveEnabled: !state.autoSaveEnabled })),
      
      validateForm: () => {
        const { formFields, formData } = get();
        const errors: Record<string, string> = {};
        const warnings: Record<string, string> = {};
        
        let requiredFieldsCompleted = 0;
        const totalRequiredFields = formFields.filter(f => f.required).length;
        
        formFields.forEach(field => {
          const value = formData[field.name];
          
          // Check required fields
          if (field.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
            errors[field.name] = `${field.name} is required`;
          } else if (field.required && value) {
            requiredFieldsCompleted++;
          }
          
          // Validate field-specific rules
          if (value && field.validation) {
            const validation = field.validation;
            
            if (validation.minLength && value.length < validation.minLength) {
              errors[field.name] = `Minimum length is ${validation.minLength} characters`;
            }
            
            if (validation.maxLength && value.length > validation.maxLength) {
              errors[field.name] = `Maximum length is ${validation.maxLength} characters`;
            }
            
            if (validation.pattern) {
              const pattern = typeof validation.pattern === 'string' 
                ? new RegExp(validation.pattern) 
                : validation.pattern;
              if (!pattern.test(value)) {
                errors[field.name] = 'Invalid format';
              }
            }
          }
        });
        
        const completionPercentage = totalRequiredFields > 0 
          ? Math.round((requiredFieldsCompleted / totalRequiredFields) * 100) 
          : 100;
        
        return {
          isValid: Object.keys(errors).length === 0,
          errors,
          warnings,
          completionPercentage,
          requiredFieldsCompleted,
          totalRequiredFields,
        };
      },
      
      resetForm: () => set({ 
        formData: {}, 
        formValidation: null, 
        isDirty: false 
      }),
      
      // Rendering actions
      setPageRenderingState: (page, state) => {
        const { renderingStates } = get();
        set({ 
          renderingStates: { 
            ...renderingStates, 
            [page]: state 
          } 
        });
      },
      
      cachePageRender: (key, data) => {
        const { pageCache, maxCacheSize, memoryStats } = get();
        const newCache = new Map(pageCache);
        
        // Estimate memory usage (rough calculation)
        const estimatedSize = JSON.stringify(data).length * 2;
        
        // Clean up cache if approaching limit
        if (memoryStats.cacheSize + estimatedSize > maxCacheSize) {
          // Remove oldest entries
          const entries = Array.from(newCache.entries());
          const toRemove = Math.ceil(entries.length * 0.3); // Remove 30%
          for (let i = 0; i < toRemove; i++) {
            newCache.delete(entries[i][0]);
          }
        }
        
        newCache.set(key, { ...data, timestamp: Date.now() });
        set({ 
          pageCache: newCache,
          memoryStats: {
            ...memoryStats,
            cacheSize: memoryStats.cacheSize + estimatedSize,
          }
        });
      },
      
      cacheThumbnail: (page, imageData) => {
        const { thumbnailCache } = get();
        const newCache = new Map(thumbnailCache);
        newCache.set(page, imageData);
        set({ thumbnailCache: newCache });
      },
      
      clearCache: () => {
        set({ 
          pageCache: new Map(), 
          thumbnailCache: new Map(),
          memoryStats: {
            ...get().memoryStats,
            cacheSize: 0,
          }
        });
      },
      
      // Configuration
      updateConfig: (newConfig) => {
        const { config } = get();
        set({ config: { ...config, ...newConfig } });
      },
      
      // Performance
      updateMemoryStats: (stats) => {
        const { memoryStats } = get();
        set({ memoryStats: { ...memoryStats, ...stats } });
      },
      
      // UI actions
      setSelectedText: (text) => set({ selectedText: text }),
      
      setSearchQuery: (query) => set({ searchQuery: query }),
      
      setSearchResults: (results) => set({ searchResults: results }),
      
      toggleFullscreen: () => set((state) => ({ fullscreen: !state.fullscreen })),
      
      // Utility actions
      resetPDF: () => {
        get().clearCache();
        set({
          ...initialPDFState,
          pageCache: new Map(),
          thumbnailCache: new Map(),
        });
      },
      
      cleanup: () => {
        const { pdfDocument } = get();
        if (pdfDocument) {
          pdfDocument.cleanup?.();
        }
        get().clearCache();
      },
    }),
    { name: 'pdf-store' }
  )
);

// Workflow State
interface WorkflowState {
  sessionId: string | null;
  recipients: any[];
  currentRecipientIndex: number;
  workflowStatus: 'draft' | 'active' | 'completed' | 'cancelled';
}

interface WorkflowActions {
  setSessionId: (id: string | null) => void;
  setRecipients: (recipients: any[]) => void;
  setCurrentRecipientIndex: (index: number) => void;
  setWorkflowStatus: (status: WorkflowState['workflowStatus']) => void;
  resetWorkflow: () => void;
}

const initialWorkflowState: WorkflowState = {
  sessionId: null,
  recipients: [],
  currentRecipientIndex: 0,
  workflowStatus: 'draft',
};

export const useWorkflowStore = create<WorkflowState & WorkflowActions>()(
  devtools(
    (set) => ({
      ...initialWorkflowState,
      
      setSessionId: (id) => set({ sessionId: id }),
      setRecipients: (recipients) => set({ recipients }),
      setCurrentRecipientIndex: (index) => set({ currentRecipientIndex: index }),
      setWorkflowStatus: (status) => set({ workflowStatus: status }),
      resetWorkflow: () => set(initialWorkflowState),
    }),
    { name: 'workflow-store' }
  )
);

// Attachment State
interface AttachmentState {
  attachments: any[];
  uploading: boolean;
  uploadProgress: number;
}

interface AttachmentActions {
  setAttachments: (attachments: any[]) => void;
  addAttachment: (attachment: any) => void;
  removeAttachment: (id: string) => void;
  setUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
  resetAttachments: () => void;
}

const initialAttachmentState: AttachmentState = {
  attachments: [],
  uploading: false,
  uploadProgress: 0,
};

export const useAttachmentStore = create<AttachmentState & AttachmentActions>()(
  devtools(
    (set) => ({
      ...initialAttachmentState,
      
      setAttachments: (attachments) => set({ attachments }),
      addAttachment: (attachment) => set((state) => ({ 
        attachments: [...state.attachments, attachment] 
      })),
      removeAttachment: (id) => set((state) => ({ 
        attachments: state.attachments.filter(att => att.id !== id) 
      })),
      setUploading: (uploading) => set({ uploading }),
      setUploadProgress: (progress) => set({ uploadProgress: progress }),
      resetAttachments: () => set(initialAttachmentState),
    }),
    { name: 'attachment-store' }
  )
);