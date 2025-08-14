import { Router } from 'express';
import { PDFController, validateFormDataInput, validateSessionId } from '../controllers/pdfController';
import { PDFService } from '../services/pdfService';
import { optionalAuth } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/errorHandler';

// Create PDF controller instance
const pdfService = new PDFService();
const pdfController = new PDFController(pdfService);

// Create router
export const pdfRoutes = Router();

// GET /api/pdf/merx - Get Merx PDF with hidden signature fields (public)
pdfRoutes.get('/merx', pdfController.getMerxPdf);

// GET /api/pdf/:sessionId/info - Get PDF information
pdfRoutes.get(
  '/:sessionId/info',
  validateSessionId,
  handleValidationErrors,
  optionalAuth,
  pdfController.getPdfInfo
);

// GET /api/pdf/:sessionId/thumbnails - Get PDF thumbnails
pdfRoutes.get(
  '/:sessionId/thumbnails',
  validateSessionId,
  handleValidationErrors,
  optionalAuth,
  pdfController.getPdfThumbnails
);

// POST /api/pdf/:sessionId/form-data - Save form data
pdfRoutes.post(
  '/:sessionId/form-data',
  validateFormDataInput,
  handleValidationErrors,
  optionalAuth,
  pdfController.saveFormData
);

// POST /api/pdf/:sessionId/validate - Validate form data
pdfRoutes.post(
  '/:sessionId/validate',
  validateFormDataInput,
  handleValidationErrors,
  optionalAuth,
  pdfController.validateFormData
);

// GET /api/pdf/:sessionId/download - Download filled PDF
pdfRoutes.get(
  '/:sessionId/download',
  validateSessionId,
  handleValidationErrors,
  optionalAuth,
  pdfController.downloadFilledPdf
);