import { Router } from 'express';
import { 
  AttachmentController,
  validateSessionId,
  validateAttachmentId,
  validatePresignedUrlRequest,
  createAttachmentUploadMiddleware
} from '../controllers/attachmentController';
import { AttachmentService } from '../services/attachmentService';
import { optionalAuth } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/errorHandler';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';

// Create service and controller instances
const attachmentService = new AttachmentService(prisma);
const attachmentController = new AttachmentController(attachmentService);
const uploadMiddleware = createAttachmentUploadMiddleware(attachmentService);

// Create router
export const attachmentRoutes = Router();

// POST /api/attachments/:sessionId/upload - Upload attachments
attachmentRoutes.post(
  '/:sessionId/upload',
  uploadRateLimiter,
  validateSessionId,
  handleValidationErrors,
  optionalAuth,
  uploadMiddleware,
  attachmentController.uploadAttachments
);

// POST /api/attachments/:sessionId/presigned-url - Generate presigned upload URL
attachmentRoutes.post(
  '/:sessionId/presigned-url',
  uploadRateLimiter,
  validatePresignedUrlRequest,
  handleValidationErrors,
  optionalAuth,
  attachmentController.generateUploadUrl
);

// GET /api/attachments/:sessionId - Get all attachments for session
attachmentRoutes.get(
  '/:sessionId',
  validateSessionId,
  handleValidationErrors,
  optionalAuth,
  attachmentController.getAttachments
);

// GET /api/attachments/:attachmentId/download - Download attachment
attachmentRoutes.get(
  '/:attachmentId/download',
  validateAttachmentId,
  handleValidationErrors,
  optionalAuth,
  attachmentController.downloadAttachment
);

// GET /api/attachments/:attachmentId/url - Get download URL
attachmentRoutes.get(
  '/:attachmentId/url',
  validateAttachmentId,
  handleValidationErrors,
  optionalAuth,
  attachmentController.getDownloadUrl
);

// POST /api/attachments/:attachmentId/confirm - Confirm upload completion
attachmentRoutes.post(
  '/:attachmentId/confirm',
  validateAttachmentId,
  handleValidationErrors,
  optionalAuth,
  attachmentController.confirmUpload
);

// GET /api/attachments/:attachmentId - Get attachment metadata
attachmentRoutes.get(
  '/:attachmentId',
  validateAttachmentId,
  handleValidationErrors,
  optionalAuth,
  attachmentController.getAttachmentById
);

// DELETE /api/attachments/:attachmentId - Delete attachment
attachmentRoutes.delete(
  '/:attachmentId',
  validateAttachmentId,
  handleValidationErrors,
  optionalAuth,
  attachmentController.deleteAttachment
);