import { Request, Response } from 'express';
import { PDFService } from '../services/pdfService';
import { logger } from '../config/logger';
import { createApiResponse, createErrorResponse } from '../utils';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';
import { body, param, validationResult } from 'express-validator';

export class PDFController {
  constructor(private pdfService: PDFService) {}

  // GET /api/pdf/merx - Get Merx PDF with hidden signature fields
  getMerxPdf = asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    logger.info('Serving Merx PDF request', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    try {
      // Get original PDF
      const originalPdf = await this.pdfService.getMerxPdf();
      
      // Process PDF to hide signature fields
      const processedPdf = await this.pdfService.processPdfWithHiddenSignatures(originalPdf);

      // Set response headers
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': processedPdf.length.toString(),
        'Content-Disposition': 'inline; filename="merx.pdf"',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'ETag': `"pdf-merx-${Date.now()}"`,
      });

      res.send(processedPdf);
    } catch (error) {
      logger.error('Error serving Merx PDF', {
        error: (error as Error).message,
        ip: req.ip,
      });
      res.status(500).json(createErrorResponse('Failed to serve PDF'));
    }
  });

  // GET /api/pdf/:sessionId/info - Get PDF information
  getPdfInfo = asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const { sessionId } = req.params;

    logger.debug('Getting PDF info', { sessionId });

    try {
      // Get original PDF
      const originalPdf = await this.pdfService.getMerxPdf();
      
      // Get PDF information
      const pdfInfo = await this.pdfService.getPdfInfo(originalPdf);

      res.json(createApiResponse(pdfInfo, 'PDF information retrieved successfully'));
    } catch (error) {
      logger.error('Error getting PDF info', {
        sessionId,
        error: (error as Error).message,
      });
      res.status(500).json(createErrorResponse('Failed to get PDF information'));
    }
  });

  // GET /api/pdf/:sessionId/thumbnails - Get PDF thumbnails
  getPdfThumbnails = asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const { sessionId } = req.params;

    logger.debug('Getting PDF thumbnails', { sessionId });

    try {
      // Get original PDF
      const originalPdf = await this.pdfService.getMerxPdf();
      
      // Generate thumbnails
      const thumbnails = await this.pdfService.generateThumbnails(originalPdf);

      res.json(createApiResponse(thumbnails, 'PDF thumbnails retrieved successfully'));
    } catch (error) {
      logger.error('Error getting PDF thumbnails', {
        sessionId,
        error: (error as Error).message,
      });
      res.status(500).json(createErrorResponse('Failed to get PDF thumbnails'));
    }
  });

  // POST /api/pdf/:sessionId/form-data - Save form data to PDF session
  saveFormData = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createErrorResponse(
        'Validation failed',
        errors.array().map(err => `${err.param}: ${err.msg}`)
      ));
    }

    const { sessionId } = req.params;
    const { formData } = req.body;

    logger.info('Saving PDF form data', {
      sessionId,
      fieldCount: Object.keys(formData || {}).length,
      userId: req.user?.sub,
    });

    try {
      // Get original PDF
      const originalPdf = await this.pdfService.getMerxPdf();
      
      // Validate form data
      const validation = await this.pdfService.validateFormData(originalPdf, formData);
      if (!validation.valid) {
        return res.status(400).json(createErrorResponse(
          'Invalid form data',
          validation.errors
        ));
      }

      // Save form data to PDF
      const filledPdf = await this.pdfService.saveFormDataToPdf(originalPdf, formData);

      // In a real implementation, you might save this to S3 and return a URL
      // For now, we'll return success confirmation
      res.json(createApiResponse(
        {
          sessionId,
          fieldCount: Object.keys(formData).length,
          size: filledPdf.length,
        },
        'Form data saved successfully'
      ));
    } catch (error) {
      logger.error('Error saving PDF form data', {
        sessionId,
        error: (error as Error).message,
        userId: req.user?.sub,
      });
      res.status(500).json(createErrorResponse('Failed to save form data'));
    }
  });

  // POST /api/pdf/:sessionId/validate - Validate form data against PDF
  validateFormData = asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createErrorResponse(
        'Validation failed',
        errors.array().map(err => `${err.param}: ${err.msg}`)
      ));
    }

    const { sessionId } = req.params;
    const { formData } = req.body;

    logger.debug('Validating PDF form data', {
      sessionId,
      fieldCount: Object.keys(formData || {}).length,
    });

    try {
      // Get original PDF
      const originalPdf = await this.pdfService.getMerxPdf();
      
      // Validate form data
      const validation = await this.pdfService.validateFormData(originalPdf, formData);

      res.json(createApiResponse(validation, 'Form data validation completed'));
    } catch (error) {
      logger.error('Error validating PDF form data', {
        sessionId,
        error: (error as Error).message,
      });
      res.status(500).json(createErrorResponse('Failed to validate form data'));
    }
  });

  // GET /api/pdf/:sessionId/download - Download filled PDF
  downloadFilledPdf = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { sessionId } = req.params;
    const { formData } = req.query;

    logger.info('Downloading filled PDF', {
      sessionId,
      userId: req.user?.sub,
    });

    try {
      // Get original PDF
      const originalPdf = await this.pdfService.getMerxPdf();
      
      let filledPdf: Buffer;
      
      if (formData && typeof formData === 'string') {
        // Parse form data from query parameter
        const parsedFormData = JSON.parse(formData);
        filledPdf = await this.pdfService.saveFormDataToPdf(originalPdf, parsedFormData);
      } else {
        // Return original PDF if no form data provided
        filledPdf = await this.pdfService.processPdfWithHiddenSignatures(originalPdf);
      }

      // Set download headers
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': filledPdf.length.toString(),
        'Content-Disposition': `attachment; filename="filled-form-${sessionId}.pdf"`,
      });

      res.send(filledPdf);
    } catch (error) {
      logger.error('Error downloading filled PDF', {
        sessionId,
        error: (error as Error).message,
        userId: req.user?.sub,
      });
      res.status(500).json(createErrorResponse('Failed to download PDF'));
    }
  });
}

// Validation middleware for form data
export const validateFormDataInput = [
  param('sessionId')
    .isUUID()
    .withMessage('Session ID must be a valid UUID'),
  body('formData')
    .isObject()
    .withMessage('Form data must be an object')
    .custom((value) => {
      // Validate that all values are strings, numbers, or booleans
      for (const [key, val] of Object.entries(value)) {
        if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') {
          throw new Error(`Form field ${key} must be a string, number, or boolean`);
        }
      }
      return true;
    }),
];

// Validation middleware for session ID
export const validateSessionId = [
  param('sessionId')
    .isUUID()
    .withMessage('Session ID must be a valid UUID'),
];