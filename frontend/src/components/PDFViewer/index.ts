/**
 * PDF Viewer Component Exports
 * 
 * Centralized exports for all PDF viewer related components and services
 */

// Core Components
export { default as PDFViewer } from './PDFViewer';
export { default as PDFToolbar } from './PDFToolbar';
export { default as ThumbnailPanel } from './ThumbnailPanel';
export { default as ZoomControls } from './ZoomControls';
export { default as PDFFormLayer } from './PDFFormLayer';
export { default as PDFVirtualScroller } from './PDFVirtualScroller';

// Demo Component
export { default as PDFViewerDemo } from './PDFViewerDemo';

// Services
export { pdfFormService, PDFFormUtils } from '../../services/pdfFormService';
export { 
  createPDFPerformanceService, 
  PDFPerformanceUtils 
} from '../../services/pdfPerformanceService';

// Types (re-export from types/pdf.ts for convenience)
export type {
  PDFViewerProps,
  PDFViewerConfig,
  PDFFormField,
  PDFFormData,
  PDFFormValidationResult,
  PDFRenderOptions,
  PDFPageRenderInfo,
  PDFMemoryStats,
  PDFError,
  // DEFAULT_PDF_CONFIG,
} from '../../types/pdf';

// Hooks
export {
  usePDFViewer,
  usePDFNavigation,
  usePDFZoom,
} from '../../hooks/usePDFViewer';

// Store
export { usePDFStore } from '../../store';

// Utilities
export const PDFViewerUtils = {
  /**
   * Check if browser supports PDF.js
   */
  isSupported: (): boolean => {
    return typeof Worker !== 'undefined' && typeof Promise !== 'undefined';
  },

  /**
   * Estimate PDF file size requirements
   */
  estimateMemoryRequirement: (pageCount: number, averagePageSize: number = 1024 * 1024): number => {
    // Rough estimate: original file + rendered pages cache
    return pageCount * averagePageSize * 1.5;
  },

  /**
   * Get optimal settings based on device capabilities
   */
  getOptimalConfig: (): Partial<PDFViewerConfig> => {
    const isLowEnd = navigator.hardwareConcurrency <= 2;
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    return {
      cacheSize: isLowEnd ? 5 : 15,
      prefetchPages: isLowEnd ? 1 : 3,
      maxCanvasPixels: isLowEnd ? 4194304 : 16777216, // 2048x2048 vs 4096x4096
      thumbnailScale: isMobile ? 0.2 : 0.3,
      renderingDelay: isLowEnd ? 200 : 50,
    };
  },

  /**
   * Format memory size for display
   */
  formatMemorySize: (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  },

  /**
   * Validate PDF URL
   */
  isValidPDFUrl: (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:', 'blob:', 'data:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  },

  /**
   * Create configuration for different use cases
   */
  createConfig: {
    // High performance for modern devices
    performance: (): Partial<PDFViewerConfig> => ({
      cacheSize: 20,
      prefetchPages: 5,
      maxCanvasPixels: 33554432, // 8192x4096
      renderingDelay: 0,
      useOnlyCssZoom: false,
    }),

    // Memory efficient for older devices
    efficient: (): Partial<PDFViewerConfig> => ({
      cacheSize: 3,
      prefetchPages: 1,
      maxCanvasPixels: 4194304, // 2048x2048
      renderingDelay: 300,
      useOnlyCssZoom: true,
    }),

    // Form-focused configuration
    forms: (): Partial<PDFViewerConfig> => ({
      renderInteractiveForms: true,
      hideSignatureFields: true,
      autoSave: true,
      saveDebounceMs: 500,
      validateFields: true,
    }),

    // Security-focused configuration
    secure: (): Partial<PDFViewerConfig> => ({
      enableScripting: false,
      disableAutoFetch: true,
      disableStream: false,
      disableRange: false,
      stopAtErrors: true,
    }),
  },
};

// Version info
export const PDFViewerVersion = {
  version: '1.0.0',
  pdfJsVersion: '5.4.54',
  features: [
    'PDF.js Integration',
    'Virtual Scrolling', 
    'Form Field Detection',
    'Memory Management',
    'Performance Optimization',
    'Touch/Mobile Support',
    'Keyboard Navigation',
    'Zoom Controls',
    'Thumbnail Panel',
    'Security Features',
  ],
  browser: {
    supported: PDFViewerUtils.isSupported(),
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency || 1,
  },
};