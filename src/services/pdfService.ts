import { PDFDocument, rgb } from 'pdf-lib';
import axios from 'axios';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { PDFFormData, PDFDocumentInfo, PDFPageInfo, NotFoundError, ApiError } from '../types';
import { RedisService } from '../config/redis';

export class PDFService {
  private redisService: RedisService;

  constructor() {
    this.redisService = new RedisService();
  }

  // Fetch the Merx PDF document
  async getMerxPdf(): Promise<Buffer> {
    try {
      logger.info('Fetching Merx PDF', { url: config.pdf.merxUrl });
      
      // Check cache first
      const cacheKey = 'pdf:merx:document';
      const cachedPdf = await this.redisService.get(cacheKey);
      
      if (cachedPdf) {
        logger.debug('Merx PDF served from cache');
        return Buffer.from(cachedPdf, 'base64');
      }

      // Fetch from remote URL
      const response = await axios.get(config.pdf.merxUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      if (!response.data) {
        throw new NotFoundError('Merx PDF not found at source URL');
      }

      const pdfBuffer = Buffer.from(response.data);
      
      // Cache for 1 hour
      await this.redisService.set(cacheKey, pdfBuffer.toString('base64'), 3600);
      
      logger.info('Merx PDF fetched and cached', { 
        size: pdfBuffer.length,
        url: config.pdf.merxUrl 
      });

      return pdfBuffer;
    } catch (error) {
      logger.error('Error fetching Merx PDF', {
        error: (error as Error).message,
        url: config.pdf.merxUrl,
      });

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new NotFoundError('Merx PDF document not found');
        }
        throw new ApiError(500, `Failed to fetch PDF: ${error.message}`);
      }

      throw error;
    }
  }

  // Process PDF and hide signature fields
  async processPdfWithHiddenSignatures(pdfBuffer: Buffer): Promise<Buffer> {
    try {
      logger.debug('Processing PDF to hide signature fields');

      // Load PDF document
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const form = pdfDoc.getForm();
      
      // Get all form fields
      const fields = form.getFields();
      const hiddenFields: string[] = [];

      // Find and hide signature fields
      fields.forEach((field) => {
        const fieldName = field.getName().toLowerCase();
        
        // Hide prescriber signature fields and any field containing 'signature'
        if (
          fieldName.includes('prescriber') && fieldName.includes('signature') ||
          fieldName.includes('doctor') && fieldName.includes('signature') ||
          fieldName.includes('physician') && fieldName.includes('signature') ||
          fieldName.includes('sig') && (fieldName.includes('prescr') || fieldName.includes('dr'))
        ) {
          try {
            // Hide the field by making it non-visible
            const acroField = field.acroField;
            if (acroField) {
              // Set field as hidden
              acroField.setFlagTo('Hidden', true);
              hiddenFields.push(field.getName());
            }
          } catch (fieldError) {
            logger.warn('Could not hide field', {
              fieldName: field.getName(),
              error: (fieldError as Error).message,
            });
          }
        }
      });

      logger.info('PDF processing completed', {
        totalFields: fields.length,
        hiddenFields: hiddenFields.length,
        hiddenFieldNames: hiddenFields,
      });

      // Save the processed PDF
      const processedPdf = await pdfDoc.save();
      return Buffer.from(processedPdf);

    } catch (error) {
      logger.error('Error processing PDF', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw new ApiError(500, 'Failed to process PDF');
    }
  }

  // Get PDF document information
  async getPdfInfo(pdfBuffer: Buffer): Promise<PDFDocumentInfo> {
    try {
      logger.debug('Extracting PDF information');

      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pages = pdfDoc.getPages();
      const form = pdfDoc.getForm();
      
      // Extract page information
      const pageInfo: PDFPageInfo[] = pages.map((page, index) => ({
        pageNumber: index + 1,
        width: page.getWidth(),
        height: page.getHeight(),
      }));

      // Extract form field names
      const formFields = form.getFields().map(field => field.getName());
      
      // Identify hidden signature fields
      const hiddenSignatureFields = formFields.filter(fieldName => {
        const lowerName = fieldName.toLowerCase();
        return (
          lowerName.includes('prescriber') && lowerName.includes('signature') ||
          lowerName.includes('doctor') && lowerName.includes('signature') ||
          lowerName.includes('physician') && lowerName.includes('signature') ||
          lowerName.includes('sig') && (lowerName.includes('prescr') || lowerName.includes('dr'))
        );
      });

      const documentInfo: PDFDocumentInfo = {
        numPages: pages.length,
        pages: pageInfo,
        formFields,
        hiddenSignatureFields,
      };

      logger.info('PDF information extracted', {
        numPages: documentInfo.numPages,
        formFields: documentInfo.formFields.length,
        hiddenSignatureFields: documentInfo.hiddenSignatureFields.length,
      });

      return documentInfo;

    } catch (error) {
      logger.error('Error extracting PDF info', {
        error: (error as Error).message,
      });
      throw new ApiError(500, 'Failed to extract PDF information');
    }
  }

  // Save form data to PDF
  async saveFormDataToPdf(
    originalPdfBuffer: Buffer, 
    formData: PDFFormData
  ): Promise<Buffer> {
    try {
      logger.debug('Saving form data to PDF', {
        formFieldCount: Object.keys(formData).length,
      });

      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      const form = pdfDoc.getForm();

      // Fill form fields
      Object.entries(formData).forEach(([fieldName, value]) => {
        try {
          const field = form.getField(fieldName);
          
          if (field) {
            // Handle different field types
            if (field.constructor.name === 'PDFTextField') {
              (field as any).setText(String(value));
            } else if (field.constructor.name === 'PDFCheckBox') {
              if (Boolean(value)) {
                (field as any).check();
              } else {
                (field as any).uncheck();
              }
            } else if (field.constructor.name === 'PDFRadioGroup') {
              (field as any).select(String(value));
            } else if (field.constructor.name === 'PDFDropdown') {
              (field as any).select(String(value));
            }
            
            logger.debug('Form field filled', { fieldName, value: String(value) });
          } else {
            logger.warn('Form field not found', { fieldName });
          }
        } catch (fieldError) {
          logger.warn('Error filling form field', {
            fieldName,
            value,
            error: (fieldError as Error).message,
          });
        }
      });

      // Save the filled PDF
      const filledPdf = await pdfDoc.save();
      
      logger.info('Form data saved to PDF', {
        formFieldCount: Object.keys(formData).length,
        outputSize: filledPdf.length,
      });

      return Buffer.from(filledPdf);

    } catch (error) {
      logger.error('Error saving form data to PDF', {
        error: (error as Error).message,
        formData: Object.keys(formData),
      });
      throw new ApiError(500, 'Failed to save form data to PDF');
    }
  }

  // Generate PDF thumbnails (placeholder - would typically use a service like ImageMagick)
  async generateThumbnails(pdfBuffer: Buffer): Promise<string[]> {
    try {
      logger.debug('Generating PDF thumbnails');

      // In a real implementation, you would use ImageMagick or similar
      // For now, return placeholder URLs
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pageCount = pdfDoc.getPageCount();
      
      const thumbnails = Array.from({ length: pageCount }, (_, index) => 
        `/api/pdf/thumbnails/page-${index + 1}.png`
      );

      logger.info('PDF thumbnails generated', {
        pageCount,
        thumbnailCount: thumbnails.length,
      });

      return thumbnails;

    } catch (error) {
      logger.error('Error generating PDF thumbnails', {
        error: (error as Error).message,
      });
      throw new ApiError(500, 'Failed to generate PDF thumbnails');
    }
  }

  // Validate form data against PDF fields
  async validateFormData(
    pdfBuffer: Buffer, 
    formData: PDFFormData
  ): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      const fieldNames = fields.map(field => field.getName());
      
      const errors: string[] = [];
      
      // Check for invalid field names
      Object.keys(formData).forEach(fieldName => {
        if (!fieldNames.includes(fieldName)) {
          errors.push(`Field '${fieldName}' does not exist in PDF`);
        }
      });

      // Additional validation could be added here
      // e.g., field type validation, required field validation, etc.

      const valid = errors.length === 0;

      logger.debug('Form data validation completed', {
        valid,
        errorCount: errors.length,
        fieldCount: Object.keys(formData).length,
      });

      return { valid, errors };

    } catch (error) {
      logger.error('Error validating form data', {
        error: (error as Error).message,
      });
      throw new ApiError(500, 'Failed to validate form data');
    }
  }

  // Cache PDF processing results
  private async cacheProcessedPdf(key: string, pdfBuffer: Buffer, ttl: number = 3600): Promise<void> {
    try {
      await this.redisService.set(
        `pdf:processed:${key}`, 
        pdfBuffer.toString('base64'), 
        ttl
      );
    } catch (error) {
      logger.warn('Failed to cache processed PDF', {
        key,
        error: (error as Error).message,
      });
    }
  }

  // Get cached processed PDF
  private async getCachedProcessedPdf(key: string): Promise<Buffer | null> {
    try {
      const cached = await this.redisService.get(`pdf:processed:${key}`);
      if (cached) {
        return Buffer.from(cached, 'base64');
      }
      return null;
    } catch (error) {
      logger.warn('Failed to get cached processed PDF', {
        key,
        error: (error as Error).message,
      });
      return null;
    }
  }
}