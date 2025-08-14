import { Response } from 'express';
import { AttachmentService } from '../services/attachmentService';
import { logger } from '../config/logger';
import { createApiResponse, createErrorResponse } from '../utils';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';
import { body, param, validationResult } from 'express-validator';

export class AttachmentController {
  constructor(private attachmentService: AttachmentService) {}

  // POST /api/attachments/:sessionId/upload - Upload attachment files
  uploadAttachments = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createErrorResponse(
        'Validation failed',
        errors.array().map((err: any) => `${err.param || err.path}: ${err.msg}`)
      ));
    }

    const { sessionId } = req.params;
    const recipientId = req.session?.recipientId || req.user?.sub;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json(createErrorResponse('No files provided'));
    }

    logger.info('Uploading attachments', {
      sessionId,
      recipientId,
      fileCount: files.length,
      files: files.map(f => ({ name: f.originalname, size: f.size })),
    });

    try {
      // Upload each file
      const uploadPromises = files.map(file => 
        this.attachmentService.uploadAttachment(sessionId, recipientId, file)
      );
      
      const attachments = await Promise.all(uploadPromises);

      res.status(201).json(createApiResponse(
        attachments,
        `${attachments.length} attachment(s) uploaded successfully`
      ));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error uploading attachments', {
        sessionId,
        recipientId,
        fileCount: files.length,
        error: errorMessage,
      });
      
      // Return appropriate error status
      if (error.name === 'NotFoundError') {
        res.status(404).json(createErrorResponse(error.message));
      } else if (error.name === 'ValidationError') {
        res.status(400).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse('Failed to upload attachments'));
      }
    }
  });

  // POST /api/attachments/:sessionId/presigned-url - Generate presigned upload URL
  generateUploadUrl = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createErrorResponse(
        'Validation failed',
        errors.array().map((err: any) => `${err.param || err.path}: ${err.msg}`)
      ));
    }

    const { sessionId } = req.params;
    const { fileName, fileType, fileSize } = req.body;

    logger.info('Generating presigned upload URL', {
      sessionId,
      fileName,
      fileType,
      fileSize,
      userId: req.user?.sub,
    });

    try {
      const uploadResponse = await this.attachmentService.generatePresignedUploadUrl(
        sessionId,
        fileName,
        fileType,
        fileSize
      );

      res.json(createApiResponse(
        uploadResponse,
        'Presigned upload URL generated successfully'
      ));
    } catch (error) {
      logger.error('Error generating presigned upload URL', {
        sessionId,
        fileName,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.sub,
      });
      
      // Return appropriate error status
      if (error.name === 'NotFoundError') {
        res.status(404).json(createErrorResponse(error.message));
      } else if (error.name === 'ValidationError') {
        res.status(400).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse('Failed to generate upload URL'));
      }
    }
  });

  // GET /api/attachments/:sessionId - Get all attachments for session
  getAttachments = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { sessionId } = req.params;

    logger.info('Getting attachments', {
      sessionId,
      userId: req.user?.sub || 'anonymous',
    });

    try {
      const attachments = await this.attachmentService.getAttachments(sessionId);

      res.json(createApiResponse(
        attachments,
        `Retrieved ${attachments.length} attachment(s)`
      ));
    } catch (error) {
      logger.error('Error getting attachments', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.sub || 'anonymous',
      });
      res.status(500).json(createErrorResponse('Failed to retrieve attachments'));
    }
  });

  // GET /api/attachments/:attachmentId/download - Download attachment
  downloadAttachment = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { attachmentId } = req.params;

    logger.info('Downloading attachment', {
      attachmentId,
      userId: req.user?.sub || 'anonymous',
    });

    try {
      const downloadUrl = await this.attachmentService.getAttachmentDownloadUrl(attachmentId);

      // Redirect to presigned URL for direct download
      res.redirect(302, downloadUrl);
    } catch (error) {
      logger.error('Error downloading attachment', {
        attachmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.sub || 'anonymous',
      });
      
      // Return appropriate error status
      if (error.name === 'NotFoundError') {
        res.status(404).json(createErrorResponse('Attachment not found'));
      } else {
        res.status(500).json(createErrorResponse('Failed to download attachment'));
      }
    }
  });

  // GET /api/attachments/:attachmentId/url - Get download URL for attachment
  getDownloadUrl = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { attachmentId } = req.params;

    logger.debug('Getting download URL', {
      attachmentId,
      userId: req.user?.sub || 'anonymous',
    });

    try {
      const downloadUrl = await this.attachmentService.getAttachmentDownloadUrl(attachmentId);

      res.json(createApiResponse(
        { downloadUrl },
        'Download URL generated successfully'
      ));
    } catch (error) {
      logger.error('Error getting download URL', {
        attachmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.sub || 'anonymous',
      });
      
      // Return appropriate error status
      if (error.name === 'NotFoundError') {
        res.status(404).json(createErrorResponse('Attachment not found'));
      } else {
        res.status(500).json(createErrorResponse('Failed to generate download URL'));
      }
    }
  });

  // GET /api/attachments/:attachmentId - Get attachment metadata
  getAttachmentById = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { attachmentId } = req.params;

    logger.debug('Getting attachment metadata', {
      attachmentId,
      userId: req.user?.sub || 'anonymous',
    });

    try {
      const attachment = await this.attachmentService.getAttachmentById(attachmentId);

      if (!attachment) {
        return res.status(404).json(createErrorResponse('Attachment not found'));
      }

      res.json(createApiResponse(
        attachment,
        'Attachment metadata retrieved successfully'
      ));
    } catch (error) {
      logger.error('Error getting attachment metadata', {
        attachmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.sub || 'anonymous',
      });
      res.status(500).json(createErrorResponse('Failed to retrieve attachment metadata'));
    }
  });

  // POST /api/attachments/:attachmentId/confirm - Confirm upload completion
  confirmUpload = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { attachmentId } = req.params;

    logger.info('Confirming upload', {
      attachmentId,
      userId: req.user?.sub || 'anonymous',
    });

    try {
      const confirmedAttachment = await this.attachmentService.confirmUpload(attachmentId);

      res.json(createApiResponse(
        confirmedAttachment,
        'Upload confirmed successfully'
      ));
    } catch (error) {
      logger.error('Error confirming upload', {
        attachmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.sub || 'anonymous',
      });
      
      // Return appropriate error status
      if (error.name === 'NotFoundError') {
        res.status(404).json(createErrorResponse('Attachment not found'));
      } else if (error.name === 'ValidationError') {
        res.status(400).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse('Failed to confirm upload'));
      }
    }
  });

  // DELETE /api/attachments/:attachmentId - Delete attachment
  deleteAttachment = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { attachmentId } = req.params;
    const userId = req.user?.sub || req.session?.recipientId;

    logger.info('Deleting attachment', {
      attachmentId,
      userId,
    });

    try {
      await this.attachmentService.deleteAttachment(attachmentId, userId);

      res.json(createApiResponse(
        { attachmentId },
        'Attachment deleted successfully'
      ));
    } catch (error) {
      logger.error('Error deleting attachment', {
        attachmentId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Return appropriate error status
      if (error.name === 'NotFoundError') {
        res.status(404).json(createErrorResponse('Attachment not found'));
      } else if (error.name === 'ForbiddenError') {
        res.status(403).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse('Failed to delete attachment'));
      }
    }
  });
}

// Validation middleware for session ID
export const validateSessionId = [
  param('sessionId')
    .isUUID()
    .withMessage('Session ID must be a valid UUID'),
];

// Validation middleware for attachment ID
export const validateAttachmentId = [
  param('attachmentId')
    .isUUID()
    .withMessage('Attachment ID must be a valid UUID'),
];

// Validation middleware for presigned URL request
export const validatePresignedUrlRequest = [
  param('sessionId')
    .isUUID()
    .withMessage('Session ID must be a valid UUID'),
  body('fileName')
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage('File name must be 1-255 characters')
    .matches(/^[^<>:"|?*\x00]*$/)
    .withMessage('File name contains invalid characters'),
  body('fileType')
    .isString()
    .matches(/^image\/(jpeg|png|gif|webp|bmp)$/)
    .withMessage('File type must be an image (jpeg, png, gif, webp, bmp) - MVP supports images only'),
  body('fileSize')
    .isInt({ min: 1, max: 25 * 1024 * 1024 })
    .withMessage('File size must be between 1 byte and 25MB'),
];

// Create multer configuration for file uploads
export const createAttachmentUploadMiddleware = (attachmentService: AttachmentService) => {
  const multer = attachmentService.getMulterConfig();
  return multer.array('files', 5); // Maximum 5 files per upload
};