import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Box, CircularProgress, Alert, LinearProgress, Typography } from '@mui/material';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, AnnotationData } from 'pdfjs-dist';
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
  const formLayerRef = useRef<HTMLDivElement>(null);
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

  // Auto-resize PDF to fit canvas width
  const autoResizePDFToCanvas = useCallback(async (document: PDFDocumentProxy) => {
    try {
      console.log('🚀 Auto-resize function called');
      const canvas = canvasRef.current;
      const container = containerRef.current;
      
      if (!canvas || !container || !document) {
        console.log('⚠️ Auto-resize skipped:', { canvas: !!canvas, container: !!container, document: !!document });
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
      
      console.log(`📐 Auto-resize: PDF ${viewport.width}x${viewport.height}, Container ${availableWidth}px, Scale ${optimalScale.toFixed(2)}, Zoom ${zoomPercentage}%`);
      
      // Update zoom level in the store (this will trigger re-rendering)  
      const { setZoomLevel } = usePDFStore.getState();
      setZoomLevel(zoomPercentage);
      
      if (onZoomChange) {
        onZoomChange(zoomPercentage);
      }
      
    } catch (error) {
      console.warn('⚠️ Auto-resize failed:', error);
    }
  }, [onZoomChange]);

  // Load PDF document from pdfData
  useEffect(() => {
    const loadPDF = async () => {
      if (!pdfData) {
        console.log('⏳ Waiting for PDF data...');
        return;
      }
      
      console.log('📄 Starting PDF document load, data size:', pdfData.byteLength);
      setLoading(true);
      setError(null);
      
      try {
        // Use proper configuration for PDF.js v3
        const loadingTask = pdfjsLib.getDocument({
          data: pdfData,
          enableXfa: false,
        });
        
        // Add progress handler
        loadingTask.onProgress = (progressData: any) => {
          console.log('📊 PDF loading progress:', progressData.loaded, '/', progressData.total);
        };
        
        console.log('⏳ Awaiting PDF document promise...');
        
        // Add timeout to prevent hanging
        const doc = await Promise.race([
          loadingTask.promise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('PDF loading timeout after 10 seconds')), 10000)
          )
        ]) as any;
        console.log('✅ PDF document loaded, pages:', doc.numPages);
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
        console.error('❌ PDF document load error:', err);
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

  // Enhanced signature field detection and hiding
  const hideSignatureFields = useCallback(async (page: PDFPageProxy) => {
    try {
      const annotations = await page.getAnnotations();
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      
      if (!context || !canvas) return;
      
      const viewport = page.getViewport({ scale: zoomLevel / 100 });
      
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
          const canvasY = canvas.height - (y2 * viewport.scale);
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
  }, [zoomLevel]);

  // Enhanced page rendering with caching and lazy loading
  const renderPage = useCallback(async () => {
    if (!pdfDocument || !canvasRef.current || pageRendering) return;

    setPageRendering(true);
    
    try {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) return;

      const scale = zoomLevel / 100;
      
      // Check cache first
      const cachedPage = getCachedPage(currentPage, scale);
      if (cachedPage) {
        canvas.width = cachedPage.canvas.width;
        canvas.height = cachedPage.canvas.height;
        context.drawImage(cachedPage.canvas, 0, 0);
        return;
      }

      const page = await pdfDocument.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Clear canvas
      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
      
      // Hide signature fields after rendering
      await hideSignatureFields(page);
      
      // Cache the rendered page
      setCachedPage(currentPage, scale, canvas);
      
      // Auto-resize on first render when refs are available
      if (pdfDocument && !hasAutoResized && currentPage === 1) {
        console.log('🎯 Calling auto-resize after first render');
        setHasAutoResized(true);
        await autoResizePDFToCanvas(pdfDocument);
      }
        
    } catch (err) {
      setError(`Failed to render page: ${err}`);
    } finally {
      setPageRendering(false);
    }
  }, [pdfDocument, currentPage, zoomLevel, pageRendering, setError, getCachedPage, setCachedPage, hideSignatureFields, hasAutoResized, autoResizePDFToCanvas]);

  // Render current page
  useEffect(() => {
    renderPage();
  }, [renderPage]);

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
      <PDFToolbar workflowContext={workflowContext} />
      
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
            // Traditional single page mode
            <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
              {pageRendering && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    borderRadius: 1,
                    p: 2,
                  }}
                >
                  <CircularProgress size={24} />
                </Box>
              )}
              
              <canvas
                ref={canvasRef}
                style={{
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

              {/* Form Layer Overlay */}
              {enableFormInteraction && formFields.length > 0 && !virtualScrollEnabled && (
                <Box
                  ref={formLayerRef}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'auto',
                    zIndex: 10,
                  }}
                >
                  {/* Form fields would be rendered here based on current page */}
                  {formFields
                    .filter(field => field.page === currentPage)
                    .map(field => (
                      <Box
                        key={field.id}
                        sx={{
                          position: 'absolute',
                          left: `${field.rect[0] * (zoomLevel / 100)}px`,
                          top: `${field.rect[1] * (zoomLevel / 100)}px`,
                          width: `${(field.rect[2] - field.rect[0]) * (zoomLevel / 100)}px`,
                          height: `${(field.rect[3] - field.rect[1]) * (zoomLevel / 100)}px`,
                          border: '2px solid rgba(25, 118, 210, 0.3)',
                          backgroundColor: 'rgba(25, 118, 210, 0.1)',
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          color: 'primary.main',
                          cursor: 'pointer',
                        }}
                        title={`${field.type} field: ${field.name}`}
                        onClick={() => {
                          // Handle field interaction
                          console.log('Field clicked:', field);
                        }}
                      >
                        {field.type}
                      </Box>
                    ))}
                </Box>
              )}
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
    </Box>
  );
};

export default PDFViewer;