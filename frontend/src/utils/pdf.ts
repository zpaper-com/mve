import * as pdfjsLib from 'pdfjs-dist';

// PDF.js worker configuration
export const configurePDFWorker = () => {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
};

// PDF rendering utilities
export const renderPDFPage = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number = 1
) => {
  const page = await pdf.getPage(pageNumber);
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Could not get canvas context');
  }

  const viewport = page.getViewport({ scale });
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    canvas: canvas,
  };

  await page.render(renderContext).promise;
  return page;
};

// Generate thumbnail for a PDF page
export const generateThumbnail = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  maxWidth: number = 150
): Promise<string> => {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  
  // Calculate scale to fit within maxWidth
  const scale = maxWidth / viewport.width;
  const thumbnailViewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Could not get canvas context');
  }

  canvas.height = thumbnailViewport.height;
  canvas.width = thumbnailViewport.width;

  const renderContext = {
    canvasContext: context,
    viewport: thumbnailViewport,
    canvas: canvas,
  };

  await page.render(renderContext).promise;
  return canvas.toDataURL();
};

// Extract form fields from PDF
export const extractFormFields = async (pdf: pdfjsLib.PDFDocumentProxy) => {
  const formFields: Record<string, any> = {};
  
  try {
    const fieldObjects = await pdf.getFieldObjects();
    
    if (fieldObjects) {
      Object.entries(fieldObjects).forEach(([fieldName, field]) => {
        const fieldArray = Array.isArray(field) ? field : [field];
        const firstField = fieldArray[0] as any;
        
        formFields[fieldName] = {
          name: fieldName,
          type: firstField?.type || 'unknown',
          value: firstField?.value || '',
          options: firstField?.options || [],
        };
      });
    }
  } catch (error) {
    console.warn('Could not extract form fields:', error);
  }
  
  return formFields;
};

// Detect and hide signature fields
export const hideSignatureFields = async (page: any) => {
  try {
    const annotations = await page.getAnnotations();
    
    annotations.forEach((annotation: any) => {
      // Check if it's a signature field or contains "prescriber" in the name
      const fieldName = annotation.fieldName?.toLowerCase() || '';
      const isSignatureField = 
        annotation.fieldType === 'Sig' || 
        fieldName.includes('prescriber') ||
        fieldName.includes('signature') ||
        fieldName.includes('sign');
      
      if (isSignatureField) {
        // Hide the field (implementation depends on PDF.js version)
        annotation.hidden = true;
        
        // Additional hiding logic can be implemented here
        // This might involve modifying the annotation's appearance
      }
    });
  } catch (error) {
    console.warn('Could not hide signature fields:', error);
  }
};

// Zoom utilities
export const calculateFitToWidth = (
  containerWidth: number,
  pageWidth: number,
  padding: number = 40
): number => {
  const availableWidth = containerWidth - padding;
  return (availableWidth / pageWidth) * 100; // Return as percentage
};

export const calculateFitToHeight = (
  containerHeight: number,
  pageHeight: number,
  padding: number = 40
): number => {
  const availableHeight = containerHeight - padding;
  return (availableHeight / pageHeight) * 100; // Return as percentage
};

// PDF loading with error handling
export const loadPDFDocument = async (
  url: string | ArrayBuffer,
  options?: any
): Promise<pdfjsLib.PDFDocumentProxy> => {
  const loadingTask = pdfjsLib.getDocument({
    url,
    cMapUrl: '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/standard_fonts/',
    enableScripting: false,
    renderInteractiveForms: true,
    ...options,
  });

  try {
    const pdf = await loadingTask.promise;
    return pdf;
  } catch (error) {
    // Cleanup on error
    loadingTask.destroy();
    throw error;
  }
};

// Convert page number to display format (1-based)
export const formatPageNumber = (pageNum: number, totalPages: number): string => {
  return `${pageNum} of ${totalPages}`;
};

// Validate zoom level
export const validateZoomLevel = (zoom: number): number => {
  return Math.max(25, Math.min(400, zoom));
};