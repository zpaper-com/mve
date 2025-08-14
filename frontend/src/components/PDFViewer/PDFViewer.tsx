import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Box, CircularProgress, Alert, LinearProgress, Typography } from '@mui/material';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, AnnotationData } from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { usePDFStore } from '../../store';
import { usePDFViewer } from '../../hooks/usePDFViewer';
import { pdfFormService } from '../../services/pdfFormService';
import { createPDFPerformanceService, PDFPerformanceUtils } from '../../services/pdfPerformanceService';
// import { DEFAULT_PDF_CONFIG } from '../../types/pdf';

// Fallback config
const DEFAULT_PDF_CONFIG = {
  enableScripting: false,
  hideSignatureFields: true,
  autoSave: true,
  saveDebounceMs: 1000,
  maxCanvasPixels: 16777216,
  cacheSize: 20,
  prefetchPages: 3,
  verbosity: 1,
};
import PDFToolbar from './PDFToolbar';
import ThumbnailPanel from './ThumbnailPanel';
import SignatureDialog from './SignatureDialog';

// Configure PDF.js worker with CDN path using the exact package version
if (typeof window !== 'undefined') {
  // Use CDN with exact version to avoid version mismatches and Vite import issues
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

interface WorkflowContext {
  isWorkflowContext: boolean;
  workflowData: any;
  currentRecipientIndex: number | null;
  isLastRecipient: boolean;
  currentRecipientToken: string | null;
  currentRecipientType?: string | null;
  currentRecipientName?: string | null;
}

interface PDFViewerProps {
  pdfUrl: string;
  onLoad?: (document: PDFDocumentProxy) => void;
  onError?: (error: Error) => void;
  onPageChange?: (pageNumber: number) => void;
  onZoomChange?: (zoomLevel: number) => void;
  onFormDataChange?: (formData: Record<string, any>) => void;
  config?: Partial<typeof DEFAULT_PDF_CONFIG>;
  enableVirtualScrolling?: boolean;
  enableFormInteraction?: boolean;
  workflowContext?: WorkflowContext;
}

interface CachedPage {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  scale: number;
  timestamp: number;
}

// Memory cache for rendered pages
const PAGE_CACHE_SIZE = 5;
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

const PDFViewer: React.FC<PDFViewerProps> = ({ 
  pdfUrl, 
  onLoad,
  onError,
  onPageChange,
  onZoomChange,
  onFormDataChange,
  config = {},
  enableVirtualScrolling = true,
  enableFormInteraction = true,
  workflowContext
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const performanceServiceRef = useRef<ReturnType<typeof createPDFPerformanceService> | null>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const pageCache = useRef<Map<string, CachedPage>>(new Map());
  
  const {
    currentPage,
    zoomLevel,
    showThumbnails,
    pdfDocument,
    isLoading,
    error,
    loadingProgress,
    formFields,
    formData,
    formValidation,
    config: storeConfig,
    setCurrentPage,
    setTotalPages,
    setPdfDocument,
    setLoading,
    setLoadingProgress,
    setError,
    setFormFields,
    updateFormField,
    setFormData,
    updateConfig,
    updateMemoryStats,
  } = usePDFStore();

  const { pdfData } = usePDFViewer(pdfUrl);
  const [pageRendering, setPageRendering] = useState(false);
  const [viewportPosition, setViewportPosition] = useState({ x: 0, y: 0 });
  const [virtualScrollEnabled, setVirtualScrollEnabled] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] = useState<any>(null);
  const [hasAutoResized, setHasAutoResized] = useState(false);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [currentFormData, setCurrentFormData] = useState<Record<string, any>>({});
  const [allWorkflowFormData, setAllWorkflowFormData] = useState<Record<string, any>>({});
  const [workflowDataLoaded, setWorkflowDataLoaded] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [currentSignatureField, setCurrentSignatureField] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<Record<string, string>>({});

  // Cache management
  const getCacheKey = useCallback((pageNumber: number, scale: number) => {
    return `${pageNumber}-${scale.toFixed(2)}`;
  }, []);

  const getCachedPage = useCallback((pageNumber: number, scale: number): CachedPage | null => {
    const key = getCacheKey(pageNumber, scale);
    const cached = pageCache.current.get(key);
    
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
      return cached;
    }
    
    if (cached) {
      pageCache.current.delete(key);
    }
    
    return null;
  }, [getCacheKey]);

  const setCachedPage = useCallback((pageNumber: number, scale: number, canvas: HTMLCanvasElement) => {
    const key = getCacheKey(pageNumber, scale);
    const clonedCanvas = document.createElement('canvas');
    clonedCanvas.width = canvas.width;
    clonedCanvas.height = canvas.height;
    const clonedContext = clonedCanvas.getContext('2d');
    
    if (clonedContext) {
      clonedContext.drawImage(canvas, 0, 0);
      
      const cached: CachedPage = {
        pageNumber,
        canvas: clonedCanvas,
        scale,
        timestamp: Date.now()
      };
      
      pageCache.current.set(key, cached);
      
      // Clean up old cache entries
      if (pageCache.current.size > PAGE_CACHE_SIZE) {
        const oldest = Array.from(pageCache.current.entries())
          .sort(([,a], [,b]) => a.timestamp - b.timestamp)[0];
        pageCache.current.delete(oldest[0]);
      }
    }
  }, [getCacheKey]);

  // Helper function to check if current user is a provider
  const isProvider = useCallback(() => {
    const result = workflowContext?.currentRecipientType === 'PRESCRIBER';
    console.log('🏥 isProvider check - currentRecipientType:', workflowContext?.currentRecipientType, 'result:', result);
    return result;
  }, [workflowContext?.currentRecipientType]);

  // Handle signature field click
  const handleSignatureFieldClick = useCallback((fieldName: string) => {
    console.log('🖊️ Signature field clicked:', fieldName, 'isProvider:', isProvider());
    if (isProvider()) {
      console.log('🖊️ Opening signature dialog for:', fieldName);
      setCurrentSignatureField(fieldName);
      setSignatureDialogOpen(true);
    } else {
      console.log('🖊️ User is not a provider, ignoring click');
    }
  }, [isProvider]);

  // Save signature
  const handleSaveSignature = useCallback(async (signatureDataUrl: string) => {
    if (currentSignatureField) {
      // Get user's IP address
      let userIP = 'Unknown';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        userIP = ipData.ip;
      } catch (error) {
        console.warn('Could not fetch IP address:', error);
      }

      // Create signature metadata
      const signatureWithMetadata = {
        signatureData: signatureDataUrl,
        signedAt: new Date().toISOString(),
        signedBy: workflowContext?.currentRecipientName || 'Unknown',
        signedIP: userIP,
        fieldName: currentSignatureField
      };

      setSignatures(prev => ({
        ...prev,
        [currentSignatureField]: signatureDataUrl
      }));
      
      // Store signature data in form data (just the image for backend compatibility)
      // Store metadata in a separate field for admin viewing
      setCurrentFormData(prev => {
        const newFormData = {
          ...prev,
          [currentSignatureField]: signatureDataUrl,
          [`${currentSignatureField}_metadata`]: JSON.stringify(signatureWithMetadata)
        };
        console.log('🖊️ Updated form data with signature:', newFormData);
        console.log('🖊️ Signature field:', currentSignatureField);
        console.log('🖊️ Signature data length:', signatureDataUrl.length);
        return newFormData;
      });
      
      setCurrentSignatureField(null);
      setSignatureDialogOpen(false);
      
      // Trigger re-render to show signature in PDF using a timeout to ensure state is updated
      setTimeout(() => {
        const renderFn = (window as any).pdfRenderFunction;
        if (renderFn) renderFn();
      }, 100);
    }
  }, [currentSignatureField, workflowContext?.currentRecipientName]);

  // Close signature dialog
  const handleCloseSignatureDialog = useCallback(() => {
    setCurrentSignatureField(null);
    setSignatureDialogOpen(false);
  }, []);

  // Auto-resize PDF to fit canvas width
  const autoResizePDFToCanvas = useCallback(async (document: PDFDocumentProxy) => {
    try {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      
      if (!canvas || !container || !document) {
        return;
      }

      // Get the first page to calculate dimensions
      const page = await document.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      
      // Get container dimensions (accounting for padding/margins)
      const containerRect = container.getBoundingClientRect();
      const availableWidth = containerRect.width - 40; // Leave some margin
      
      // Calculate the scale needed to fit the PDF width to the container
      const scaleToFitWidth = availableWidth / viewport.width;
      
      // Clamp the scale between min and max zoom levels
      const minScale = 0.25; // 25%
      const maxScale = 4.0;  // 400%
      const optimalScale = Math.max(minScale, Math.min(maxScale, scaleToFitWidth));
      
      // Convert scale to zoom percentage
      const zoomPercentage = Math.round(optimalScale * 100);
      
      
      // Update zoom level in the store (this will trigger re-rendering)  
      const { setZoomLevel } = usePDFStore.getState();
      setZoomLevel(zoomPercentage);
      
      if (onZoomChange) {
        onZoomChange(zoomPercentage);
      }
      
    } catch (error) {
      console.warn('Auto-resize failed:', error);
    }
  }, [onZoomChange]);

  // Load PDF document from pdfData
  useEffect(() => {
    const loadPDF = async () => {
      if (!pdfData) {
        return;
      }
      setLoading(true);
      setError(null);
      
      try {
        // Use proper configuration for PDF.js v3 with form support
        const loadingTask = pdfjsLib.getDocument({
          data: pdfData,
          enableXfa: false,
          isEvalSupported: false,
          useSystemFonts: true,
          fontExtraProperties: true,
          disableAutoFetch: false,
          disableCreateObjectURL: false,
          disableFontFace: false,
          disableRange: false,
          disableStream: false,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/',
        });
        
        // Add progress handler
        loadingTask.onProgress = (progressData: any) => {
        };
        
        
        // Add timeout to prevent hanging
        const doc = await Promise.race([
          loadingTask.promise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('PDF loading timeout after 10 seconds')), 10000)
          )
        ]) as any;
        setPdfDocument(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
        
        // Clear cache when new document loads
        pageCache.current.clear();
        
        // Reset auto-resize flag for new document
        setHasAutoResized(false);
        
        // Call onLoad callback if provided
        if (onLoad) {
          onLoad(doc);
        }
      } catch (err) {
        console.error('PDF document load error:', err);
        setError(`Failed to load PDF: ${err}`);
        if (onError) {
          onError(err as Error);
        }
      } finally {
        setLoading(false);
      }
    };

    loadPDF();
  }, [pdfData, setPdfDocument, setTotalPages, setCurrentPage, setLoading, setError, onLoad, onError]);

  // Helper function to hide signature fields on any canvas
  const hideSignatureFieldsOnCanvas = useCallback(async (page: PDFPageProxy, targetCanvas: HTMLCanvasElement, viewport: any) => {
    // Only hide signature fields if user is not a provider
    if (isProvider()) return;
    
    try {
      const annotations = await page.getAnnotations();
      const context = targetCanvas.getContext('2d');
      
      if (!context) return;
      
      annotations.forEach((annotation: AnnotationData) => {
        // Check if it's a signature field
        const isSignatureField = 
          annotation.subtype === 'Widget' &&
          annotation.fieldType === 'Sig' ||
          (annotation.fieldName && 
           annotation.fieldName.toLowerCase().includes('signature')) ||
          (annotation.fieldName && 
           annotation.fieldName.toLowerCase().includes('prescriber'));
        
        if (isSignatureField && annotation.rect) {
          // Convert PDF coordinates to canvas coordinates
          const [x1, y1, x2, y2] = annotation.rect;
          const canvasX = x1 * viewport.scale;
          const canvasY = targetCanvas.height - (y2 * viewport.scale);
          const width = (x2 - x1) * viewport.scale;
          const height = (y2 - y1) * viewport.scale;
          
          // Hide the signature field by drawing a white rectangle over it
          context.fillStyle = '#FFFFFF';
          context.fillRect(canvasX, canvasY, width, height);
          
          // Optional: Add a subtle border to indicate hidden field
          context.strokeStyle = '#E0E0E0';
          context.lineWidth = 1;
          context.strokeRect(canvasX, canvasY, width, height);
        }
      });
    } catch (err) {
      console.warn('Failed to process annotations:', err);
    }
  }, [isProvider]);

  // Enhanced page rendering with native PDF.js form support
  const renderPage = useCallback(async () => {
    if (!pdfDocument || !canvasRef.current || pageRendering) return;

    setPageRendering(true);
    
    try {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      const textLayer = textLayerRef.current;
      const annotationLayer = annotationLayerRef.current;
      
      if (!context) return;

      const scale = zoomLevel / 100;
      
      // Check cache first before any DOM manipulation to prevent flicker
      const cachedPage = getCachedPage(currentPage, scale);
      if (cachedPage && !enableFormInteraction) {
        canvas.width = cachedPage.canvas.width;
        canvas.height = cachedPage.canvas.height;
        context.drawImage(cachedPage.canvas, 0, 0);
        setPageRendering(false);
        return;
      }

      const page = await pdfDocument.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      
      // Only resize canvas if dimensions actually changed
      if (canvas.height !== viewport.height || canvas.width !== viewport.width) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Only clear and resize layers if canvas size changed
        if (textLayer) {
          textLayer.innerHTML = '';
          textLayer.style.width = canvas.width + 'px';
          textLayer.style.height = canvas.height + 'px';
        }
        
        if (annotationLayer) {
          console.log('🔍 Clearing annotation layer due to canvas resize (this will clear form fields!)');
          annotationLayer.innerHTML = '';
          annotationLayer.style.width = canvas.width + 'px';
          annotationLayer.style.height = canvas.height + 'px';
        }
      }

      // Create offscreen canvas for double buffering to prevent flicker
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = viewport.width;
      offscreenCanvas.height = viewport.height;
      const offscreenContext = offscreenCanvas.getContext('2d');
      
      if (!offscreenContext) return;

      const renderContext = {
        canvasContext: offscreenContext,
        viewport: viewport,
        enableWebGL: false,
        renderInteractiveForms: enableFormInteraction,
      };

      // Render PDF page to offscreen canvas
      await page.render(renderContext).promise;
      
      // Apply signature field hiding to offscreen canvas
      if (enableFormInteraction) {
        await hideSignatureFieldsOnCanvas(page, offscreenCanvas, viewport);
      }
      
      // Copy offscreen canvas to main canvas in one operation
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(offscreenCanvas, 0, 0);
      
      // Render text layer if available
      if (textLayer && enableFormInteraction) {
        try {
          const textContent = await page.getTextContent();
          if (pdfjsLib.renderTextLayer) {
            pdfjsLib.renderTextLayer({
              textContent,
              container: textLayer,
              viewport,
              textDivs: [],
            });
          }
        } catch (textError) {
          console.warn('Failed to render text layer:', textError);
        }
      }

      // Render annotation layer (forms) if available
      if (annotationLayer && enableFormInteraction) {
        try {
          const annotations = await page.getAnnotations({ intent: 'display' });
          
          if (annotations.length > 0) {
            // Clear existing annotations
            console.log('🔍 Clearing annotation layer for form rendering (this will clear form fields!)');
            annotationLayer.innerHTML = '';
            
            // Create viewport for annotations (don't flip y-axis)
            const annotationViewport = viewport.clone({ dontFlip: true });
            
            // Render each annotation as HTML element
            for (const annotation of annotations) {
              if (!annotation) continue;
              
              // Create annotation element based on type
              const element = document.createElement('section');
              element.setAttribute('data-annotation-id', annotation.id);
              
              // Position the element
              const rect = annotation.rect;
              if (rect) {
                const [x1, y1, x2, y2] = rect;
                const width = (x2 - x1) * annotationViewport.scale;
                const height = (y2 - y1) * annotationViewport.scale;
                const x = x1 * annotationViewport.scale;
                const y = (annotationViewport.height - y2 * annotationViewport.scale);
                
                element.style.position = 'absolute';
                element.style.left = `${x}px`;
                element.style.top = `${y}px`;
                element.style.width = `${width}px`;
                element.style.height = `${height}px`;
              }
              
              // Handle form fields
              if (annotation.subtype === 'Widget') {
                
                // Handle signature fields
                if (annotation.fieldType === 'Sig' || 
                    (annotation.fieldName && (
                      annotation.fieldName.toLowerCase().includes('signature') ||
                      annotation.fieldName.toLowerCase().includes('prescriber')
                    ))) {
                  
                  // If user is a provider, create signature field (readonly for first 2, editable for last)
                  console.log('🔍 Processing signature field - isProvider():', isProvider(), 'currentRecipientType:', workflowContext?.currentRecipientType);
                  console.log('🔍 Workflow context:', workflowContext);
                  
                  // Show signature fields for providers only
                  if (isProvider()) {
                    // Determine if this is the last signature field (provider signature)
                    const fieldName = annotation.fieldName || '';
                    const isLastSignature = fieldName.toLowerCase().includes('prescriber') || 
                                          fieldName.toLowerCase().includes('provider') ||
                                          fieldName.toLowerCase().includes('signature3') ||
                                          fieldName.toLowerCase().includes('sig3');
                    
                    console.log('🔍 Signature field found:', fieldName, 'isLastSignature:', isLastSignature);
                    
                    // Check if there's existing signature data from workflow
                    const existingSignature = workflowContext?.isWorkflowContext && allWorkflowFormData && fieldName ? 
                      allWorkflowFormData[fieldName] : null;
                    
                    const currentSignature = signatures[fieldName] || existingSignature;
                    
                    if (isLastSignature) {
                      // Last signature - editable by provider
                      const sigButton = document.createElement('button');
                      sigButton.style.position = 'absolute';
                      sigButton.style.left = '0';
                      sigButton.style.top = '0';
                      sigButton.style.width = '100%';
                      sigButton.style.height = '100%';
                      sigButton.style.backgroundColor = currentSignature ? 'rgba(76, 175, 80, 0.1)' : 'rgba(33, 150, 243, 0.1)';
                      sigButton.style.border = currentSignature ? '2px solid #4CAF50' : '2px dashed #2196F3';
                      sigButton.style.cursor = 'pointer';
                      sigButton.style.display = 'flex';
                      sigButton.style.alignItems = 'center';
                      sigButton.style.justifyContent = 'center';
                      sigButton.style.fontSize = '12px';
                      sigButton.style.color = currentSignature ? '#4CAF50' : '#2196F3';
                      sigButton.style.fontWeight = 'bold';
                      sigButton.style.zIndex = '1000';
                      sigButton.textContent = currentSignature ? '✓ Signed' : 'Click to Sign';
                      
                      // Show signature image if available
                      if (currentSignature && typeof currentSignature === 'string' && currentSignature.startsWith('data:image/')) {
                        const sigImg = document.createElement('img');
                        sigImg.src = currentSignature;
                        sigImg.style.maxWidth = '100%';
                        sigImg.style.maxHeight = '100%';
                        sigImg.style.objectFit = 'contain';
                        sigButton.innerHTML = '';
                        sigButton.appendChild(sigImg);
                      }
                      
                      sigButton.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Signature button clicked for field:', fieldName);
                        handleSignatureFieldClick(fieldName);
                      });
                      
                      element.appendChild(sigButton);
                    } else {
                      // First two signatures - readonly for provider
                      const sigDisplay = document.createElement('div');
                      sigDisplay.style.position = 'absolute';
                      sigDisplay.style.left = '0';
                      sigDisplay.style.top = '0';
                      sigDisplay.style.width = '100%';
                      sigDisplay.style.height = '100%';
                      sigDisplay.style.backgroundColor = currentSignature ? 'rgba(76, 175, 80, 0.05)' : 'rgba(128, 128, 128, 0.1)';
                      sigDisplay.style.border = currentSignature ? '2px solid #4CAF50' : '2px solid #999';
                      sigDisplay.style.display = 'flex';
                      sigDisplay.style.alignItems = 'center';
                      sigDisplay.style.justifyContent = 'center';
                      sigDisplay.style.fontSize = '11px';
                      sigDisplay.style.color = currentSignature ? '#4CAF50' : '#666';
                      sigDisplay.style.fontWeight = 'bold';
                      sigDisplay.style.pointerEvents = 'none';
                      
                      if (currentSignature && typeof currentSignature === 'string' && currentSignature.startsWith('data:image/')) {
                        const sigImg = document.createElement('img');
                        sigImg.src = currentSignature;
                        sigImg.style.maxWidth = '100%';
                        sigImg.style.maxHeight = '100%';
                        sigImg.style.objectFit = 'contain';
                        sigDisplay.appendChild(sigImg);
                      } else {
                        sigDisplay.textContent = currentSignature ? '✓ Signed' : 'Readonly';
                      }
                      
                      element.appendChild(sigDisplay);
                    }
                  } else {
                    // For non-providers, create a hidden placeholder
                    const sigPlaceholder = document.createElement('div');
                    sigPlaceholder.style.position = 'absolute';
                    sigPlaceholder.style.left = '0';
                    sigPlaceholder.style.top = '0';
                    sigPlaceholder.style.width = '100%';
                    sigPlaceholder.style.height = '100%';
                    sigPlaceholder.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                    sigPlaceholder.style.border = '1px dashed #ccc';
                    sigPlaceholder.style.display = 'flex';
                    sigPlaceholder.style.alignItems = 'center';
                    sigPlaceholder.style.justifyContent = 'center';
                    sigPlaceholder.style.fontSize = '10px';
                    sigPlaceholder.style.color = '#999';
                    sigPlaceholder.style.pointerEvents = 'none';
                    sigPlaceholder.textContent = 'Signature field (hidden)';
                    element.appendChild(sigPlaceholder);
                  }
                  
                  annotationLayer.appendChild(element);
                  continue;
                }
                
                let inputElement: HTMLElement | null = null;
                
                // Text fields
                if (annotation.fieldType === 'Tx') {
                  // Skip the kbup field - it should be hidden
                  if (annotation.fieldName && annotation.fieldName.toLowerCase() === 'kbup') {
                    continue;
                  }
                  
                  if (annotation.multiline) {
                    inputElement = document.createElement('textarea');
                    (inputElement as HTMLTextAreaElement).style.resize = 'none';
                  } else {
                    inputElement = document.createElement('input');
                    (inputElement as HTMLInputElement).type = 'text';
                  }
                  if (inputElement) {
                    // Use existing workflow data if available and in workflow context, otherwise use annotation default
                    const existingValue = (workflowContext?.isWorkflowContext && allWorkflowFormData && annotation.fieldName) ? 
                      (allWorkflowFormData[annotation.fieldName] || annotation.fieldValue || '') : 
                      (annotation.fieldValue || '');
                    
                    
                    (inputElement as HTMLInputElement | HTMLTextAreaElement).value = String(existingValue);
                    
                    (inputElement as HTMLInputElement | HTMLTextAreaElement).name = annotation.fieldName || '';
                    if (annotation.maxLen) {
                      (inputElement as HTMLInputElement | HTMLTextAreaElement).maxLength = annotation.maxLen;
                    }
                    
                    // Update current form data with the existing value only if in workflow context and there's a value
                    if (annotation.fieldName && existingValue && workflowContext?.isWorkflowContext) {
                      setCurrentFormData(prev => ({
                        ...prev,
                        [annotation.fieldName]: existingValue
                      }));
                    }
                  }
                }
                // Checkbox
                else if (annotation.fieldType === 'Btn' && annotation.checkBox) {
                  inputElement = document.createElement('input');
                  (inputElement as HTMLInputElement).type = 'checkbox';
                  
                  // Use existing workflow data if available and in workflow context
                  const existingValue = (workflowContext?.isWorkflowContext && allWorkflowFormData && annotation.fieldName) ? 
                    allWorkflowFormData[annotation.fieldName] : undefined;
                  const isChecked = existingValue !== undefined ? 
                    (existingValue === true || existingValue === 'Yes' || existingValue === 'true') :
                    (annotation.fieldValue === 'Yes' || annotation.fieldValue === true);
                  
                  (inputElement as HTMLInputElement).checked = isChecked;
                  (inputElement as HTMLInputElement).name = annotation.fieldName || '';
                  
                  // Update current form data with the existing value only in workflow context
                  if (annotation.fieldName && workflowContext?.isWorkflowContext) {
                    setCurrentFormData(prev => ({
                      ...prev,
                      [annotation.fieldName]: isChecked
                    }));
                  }
                }
                // Radio button
                else if (annotation.fieldType === 'Btn' && annotation.radioButton) {
                  inputElement = document.createElement('input');
                  (inputElement as HTMLInputElement).type = 'radio';
                  (inputElement as HTMLInputElement).name = annotation.fieldName || '';
                  (inputElement as HTMLInputElement).value = annotation.buttonValue || '';
                  
                  // Use existing workflow data if available and in workflow context
                  const existingValue = (workflowContext?.isWorkflowContext && allWorkflowFormData && annotation.fieldName) ? 
                    allWorkflowFormData[annotation.fieldName] : undefined;
                  const isChecked = existingValue !== undefined ? 
                    existingValue === annotation.buttonValue :
                    annotation.fieldValue === annotation.buttonValue;
                  
                  (inputElement as HTMLInputElement).checked = isChecked;
                  
                  // Update current form data with the existing value only in workflow context
                  if (annotation.fieldName && isChecked && workflowContext?.isWorkflowContext) {
                    setCurrentFormData(prev => ({
                      ...prev,
                      [annotation.fieldName]: annotation.buttonValue
                    }));
                  }
                }
                // Dropdown/Select
                else if (annotation.fieldType === 'Ch') {
                  inputElement = document.createElement('select');
                  (inputElement as HTMLSelectElement).name = annotation.fieldName || '';
                  
                  // Use existing workflow data if available and in workflow context
                  const existingValue = (workflowContext?.isWorkflowContext && allWorkflowFormData && annotation.fieldName) ? 
                    (allWorkflowFormData[annotation.fieldName] || annotation.fieldValue) : 
                    annotation.fieldValue;
                  
                  if (annotation.options) {
                    for (const option of annotation.options) {
                      const optionElement = document.createElement('option');
                      optionElement.value = option.exportValue || option.displayValue || '';
                      optionElement.textContent = option.displayValue || option.exportValue || '';
                      if (existingValue === option.exportValue) {
                        optionElement.selected = true;
                      }
                      (inputElement as HTMLSelectElement).appendChild(optionElement);
                    }
                  }
                  
                  // Update current form data with the existing value only in workflow context
                  if (annotation.fieldName && existingValue && workflowContext?.isWorkflowContext) {
                    setCurrentFormData(prev => ({
                      ...prev,
                      [annotation.fieldName]: existingValue
                    }));
                  }
                }
                
                // Style and append the input element
                if (inputElement) {
                  inputElement.style.position = 'absolute';
                  inputElement.style.left = '0';
                  inputElement.style.top = '0';
                  inputElement.style.width = '100%';
                  inputElement.style.height = '100%';
                  inputElement.style.border = '1px solid transparent';
                  inputElement.style.backgroundColor = 'rgba(0, 54, 255, 0.13)';
                  inputElement.style.fontSize = '12px';
                  inputElement.style.fontFamily = 'Helvetica, Arial, sans-serif';
                  
                  // Add event listener for form changes
                  inputElement.addEventListener('change', (e) => {
                    const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
                    const fieldName = target.name || annotation.fieldName;
                    let value: any = target.value;
                    
                    if (target.type === 'checkbox') {
                      value = (target as HTMLInputElement).checked;
                    }
                    
                    // Update local form data state
                    if (fieldName) {
                      setCurrentFormData(prev => ({
                        ...prev,
                        [fieldName]: value
                      }));
                    }
                    
                    if (fieldName && onFormDataChange) {
                      onFormDataChange({ [fieldName]: value });
                    }
                  });
                  
                  element.appendChild(inputElement);
                }
              }
              // Handle link annotations
              else if (annotation.subtype === 'Link' && annotation.url) {
                const linkElement = document.createElement('a');
                linkElement.href = annotation.url;
                linkElement.target = '_blank';
                linkElement.style.position = 'absolute';
                linkElement.style.left = '0';
                linkElement.style.top = '0';
                linkElement.style.width = '100%';
                linkElement.style.height = '100%';
                linkElement.style.display = 'block';
                element.appendChild(linkElement);
              }
              
              // Add the annotation element to the layer
              if (element.children.length > 0 || annotation.subtype === 'Widget') {
                annotationLayer.appendChild(element);
              }
            }
            
            // Extract form fields for state management
            if (annotations.some(ann => ann.subtype === 'Widget')) {
              try {
                const formFields = await pdfFormService.extractFormFields(pdfDocument);
                setFormFields(formFields);
              } catch (formError) {
                console.warn('Failed to extract form fields:', formError);
              }
            }
          }
        } catch (annotationError) {
          console.warn('Failed to render annotation layer:', annotationError);
        }
      }
      
      // Cache the rendered page (without forms for performance)
      if (!enableFormInteraction) {
        setCachedPage(currentPage, scale, canvas);
      }
      
      // Auto-resize on first render when refs are available
      if (pdfDocument && !hasAutoResized && currentPage === 1) {
        setHasAutoResized(true);
        await autoResizePDFToCanvas(pdfDocument);
      }
        
    } catch (err) {
      setError(`Failed to render page: ${err}`);
    } finally {
      setPageRendering(false);
    }
  }, [
    pdfDocument, 
    currentPage, 
    zoomLevel, 
    enableFormInteraction,
    getCachedPage,
    setCachedPage,
    hideSignatureFieldsOnCanvas,
    hasAutoResized,
    autoResizePDFToCanvas,
    setFormFields,
    onFormDataChange,
    setError,
    allWorkflowFormData,
    workflowContext,
    signatures,
    isProvider,
    handleSignatureFieldClick
  ]);

  // Expose renderPage function to window for signature re-rendering
  React.useEffect(() => {
    (window as any).pdfRenderFunction = renderPage;
    return () => {
      delete (window as any).pdfRenderFunction;
    };
  }, [renderPage]);

  // Render current page with debouncing for zoom changes
  useEffect(() => {
    if (!pdfDocument || currentPage <= 0) return;
    
    // Wait for workflow data to load before rendering in workflow context
    if (workflowContext?.isWorkflowContext && !workflowDataLoaded) {
      console.log('🔍 Waiting for workflow data to load before rendering...');
      return;
    }
    
    // Clear any pending render
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }
    
    // For page changes, render immediately
    // For zoom changes, debounce to avoid flicker
    const delay = 0; // Immediate render for now, can be adjusted if needed
    
    renderTimeoutRef.current = setTimeout(() => {
      renderPage();
    }, delay);
    
    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [pdfDocument, currentPage, zoomLevel, enableFormInteraction, allWorkflowFormData, workflowContext?.isWorkflowContext, workflowDataLoaded]);

  // Mouse wheel zoom handling
  const handleWheel = useCallback((event: React.WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      
      const container = containerRef.current;
      if (container) {
        // Store current viewport position
        const rect = container.getBoundingClientRect();
        const centerX = (event.clientX - rect.left) / rect.width;
        const centerY = (event.clientY - rect.top) / rect.height;
        
        setViewportPosition({ x: centerX, y: centerY });
      }
      
      const delta = event.deltaY > 0 ? -25 : 25;
      const newZoom = Math.max(25, Math.min(400, zoomLevel + delta));
      
      const { setZoomLevel } = usePDFStore.getState();
      setZoomLevel(newZoom);
    }
  }, [zoomLevel]);

  // Maintain view position during zoom
  useEffect(() => {
    const container = containerRef.current;
    if (container && viewportPosition.x !== 0 && viewportPosition.y !== 0) {
      const scrollLeft = (container.scrollWidth - container.clientWidth) * viewportPosition.x;
      const scrollTop = (container.scrollHeight - container.clientHeight) * viewportPosition.y;
      
      container.scrollLeft = scrollLeft;
      container.scrollTop = scrollTop;
    }
  }, [zoomLevel, viewportPosition]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target !== document.body) return;
      
      switch (event.key) {
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
          }
          break;
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          event.preventDefault();
          if (currentPage < (pdfDocument?.numPages || 0)) {
            setCurrentPage(currentPage + 1);
          }
          break;
        case 'Home':
          event.preventDefault();
          setCurrentPage(1);
          break;
        case 'End':
          event.preventDefault();
          if (pdfDocument) {
            setCurrentPage(pdfDocument.numPages);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, pdfDocument, setCurrentPage]);

  // Load existing workflow form data only when in workflow context
  React.useEffect(() => {
    // Reset loaded flag when workflow context changes
    setWorkflowDataLoaded(false);
    
    if (workflowContext?.isWorkflowContext && workflowContext?.workflowData?.workflow?.id) {
      const loadWorkflowFormData = async () => {
        try {
          console.log('🔍 Loading workflow form data for:', workflowContext.workflowData.workflow.id);
          const response = await fetch(`/api/workflows/${workflowContext.workflowData.workflow.id}/form-data`);
          if (response.ok) {
            const result = await response.json();
            console.log('🔍 Form data response:', result);
            if (result.success && result.formDataHistory) {
              // Merge all form data from previous submissions
              const mergedFormData: Record<string, any> = {};
              result.formDataHistory.forEach((submission: any) => {
                Object.assign(mergedFormData, submission.form_data);
              });
              console.log('🔍 Merged form data keys:', Object.keys(mergedFormData));
              console.log('🔍 Sample merged data:', mergedFormData);
              setAllWorkflowFormData(mergedFormData);
              setWorkflowDataLoaded(true);
            } else {
              console.log('🔍 No form data history found');
              setAllWorkflowFormData({});
              setWorkflowDataLoaded(true);
            }
          } else {
            console.warn('Failed to fetch workflow form data:', response.status);
            setAllWorkflowFormData({});
            setWorkflowDataLoaded(true);
          }
        } catch (error) {
          console.warn('Failed to load workflow form data:', error);
          setAllWorkflowFormData({});
          setWorkflowDataLoaded(true);
        }
      };
      
      loadWorkflowFormData();
    } else {
      // Clear form data when not in workflow context
      setAllWorkflowFormData({});
      setCurrentFormData({});
      setWorkflowDataLoaded(true); // No workflow data to load, so consider it "loaded"
    }
  }, [workflowContext?.isWorkflowContext, workflowContext?.workflowData?.workflow?.id]);


  // Expose form data to parent components
  React.useEffect(() => {
    if (workflowContext && Object.keys(currentFormData).length > 0) {
      // Store form data in a way that can be accessed by toolbar
      (window as any).currentPDFFormData = currentFormData;
    }
  }, [currentFormData, workflowContext]);

  if (isLoading) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          gap: 2
        }}
      >
        <CircularProgress size={60} />
        <Typography variant="h6">Loading PDF...</Typography>
        {loadingProgress > 0 && (
          <Box sx={{ width: '300px' }}>
            <LinearProgress 
              variant="determinate" 
              value={loadingProgress} 
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Typography variant="body2" sx={{ textAlign: 'center', mt: 1 }}>
              {Math.round(loadingProgress)}%
            </Typography>
          </Box>
        )}
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PDFToolbar 
        workflowContext={workflowContext} 
        getCurrentFormData={() => currentFormData}
      />
      
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {showThumbnails && (
          <ThumbnailPanel pdfDocument={pdfDocument} />
        )}
        
        <Box 
          ref={containerRef}
          onWheel={handleWheel}
          sx={{ 
            flex: 1, 
            overflow: 'auto', 
            display: 'flex',
            justifyContent: 'center',
            alignItems: virtualScrollEnabled ? 'stretch' : 'flex-start',
            p: virtualScrollEnabled ? 0 : 0.5,
            backgroundColor: '#f5f5f5',
            position: 'relative',
          }}
        >
          {virtualScrollEnabled && performanceServiceRef.current && pdfDocument ? (
            // Virtual scrolling mode for large documents
            <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
              <Box sx={{ 
                width: '100%', 
                height: '100%',
                overflow: 'auto',
                '&::-webkit-scrollbar': {
                  width: '8px',
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: '#f1f1f1',
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: '#888',
                  borderRadius: '4px',
                  '&:hover': {
                    backgroundColor: '#555',
                  },
                },
              }}>
                {/* Virtual scroller would be implemented here */}
                <Typography variant="h6" sx={{ p: 2, textAlign: 'center' }}>
                  Virtual Scrolling Mode (Large Document)
                </Typography>
              </Box>
            </Box>
          ) : (
            // Traditional single page mode with native PDF.js layers
            <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
              {pageRendering && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 1000,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    borderRadius: 1,
                    p: 2,
                  }}
                >
                  <CircularProgress size={24} />
                </Box>
              )}
              
              <Box sx={{ position: 'relative', display: 'inline-block' }}>
                {/* PDF Canvas */}
                <canvas
                  ref={canvasRef}
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    height: 'auto',
                    border: '1px solid #ccc',
                    backgroundColor: 'white',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                    cursor: pageRendering ? 'wait' : 'default',
                    opacity: pageRendering ? 0.7 : 1,
                    transition: 'opacity 0.2s ease',
                  }}
                />

                {/* Text Layer for text selection and forms */}
                {enableFormInteraction && (
                  <div
                    ref={textLayerRef}
                    className="textLayer"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      overflow: 'hidden',
                      opacity: 0.2,
                      lineHeight: 1,
                      pointerEvents: 'none',
                    }}
                  />
                )}

                {/* Annotation Layer for interactive forms */}
                {enableFormInteraction && (
                  <div
                    ref={annotationLayerRef}
                    className="annotationLayer"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      pointerEvents: 'auto',
                      zIndex: 10,
                    }}
                  />
                )}
              </Box>
            </Box>
          )}

          {/* Performance Metrics (Development Only) */}
          {import.meta.env.DEV && performanceMetrics && (
            <Box
              sx={{
                position: 'fixed',
                bottom: 16,
                left: 16,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                padding: 1,
                borderRadius: 1,
                fontSize: '0.75rem',
                zIndex: 1000,
                maxWidth: 200,
              }}
            >
              <Typography variant="caption" display="block">
                Render: {performanceMetrics.averageRenderTime.toFixed(1)}ms
              </Typography>
              <Typography variant="caption" display="block">
                Cache: {Math.round(performanceMetrics.memoryStats.cacheSize / 1024 / 1024)}MB
              </Typography>
              <Typography variant="caption" display="block">
                Pages: {performanceMetrics.memoryStats.renderedPages}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
      
      {/* Signature Dialog */}
      <SignatureDialog
        open={signatureDialogOpen}
        onClose={handleCloseSignatureDialog}
        onSave={handleSaveSignature}
        recipientName={workflowContext?.currentRecipientName || 'Provider'}
      />
    </Box>
  );
};

export default PDFViewer;