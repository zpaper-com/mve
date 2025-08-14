import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import { Request } from 'express';
import { 
  Attachment, 
  UploadAttachmentRequest, 
  UploadAttachmentResponse,
  NotFoundError,
  ValidationError,
  ApiError
} from '../types';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { generateId, sanitizeFilename, getMimeTypeFromExtension, getFileExtension, formatFileSize } from '../utils';

export class AttachmentService {
  private s3Client: S3Client;

  constructor(private prisma: PrismaClient) {
    this.s3Client = new S3Client({
      region: config.aws.region,
      ...(config.aws.accessKeyId && config.aws.secretAccessKey && {
        credentials: {
          accessKeyId: config.aws.accessKeyId,
          secretAccessKey: config.aws.secretAccessKey,
        },
      }),
    });
  }

  // Configure multer for file uploads
  getMulterConfig(): multer.Multer {
    const storage = multer.memoryStorage();
    
    return multer({
      storage,
      limits: {
        fileSize: 25 * 1024 * 1024, // 25MB
        files: 5, // Maximum 5 files per upload
      },
      fileFilter: (req: Request, file: Express.Multer.File, cb) => {
        // Allowed file types
        const allowedMimeTypes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'image/bmp',
          'application/pdf',
        ];

        const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'pdf'];
        const fileExtension = getFileExtension(file.originalname);

        if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
          cb(null, true);
        } else {
          cb(new ValidationError(`File type not allowed. Allowed types: ${allowedExtensions.join(', ')}`));
        }
      },
    });
  }

  // Upload attachment to S3 and save metadata
  async uploadAttachment(
    sessionId: string,
    recipientId: string | undefined,
    file: Express.Multer.File
  ): Promise<Attachment> {
    try {
      logger.info('Uploading attachment', {
        sessionId,
        recipientId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      });

      // Validate session exists
      const session = await this.prisma.workflowSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        throw new NotFoundError('Workflow session not found');
      }

      // Generate attachment metadata
      const attachmentId = generateId();
      const sanitizedFileName = sanitizeFilename(file.originalname);
      const fileExtension = getFileExtension(file.originalname);
      const s3Key = `documents/${sessionId}/attachments/${attachmentId}.${fileExtension}`;

      // Upload to S3
      await this.uploadToS3(s3Key, file.buffer, file.mimetype);

      // Save metadata to database
      const attachment = await this.prisma.attachment.create({
        data: {
          id: attachmentId,
          sessionId,
          recipientId,
          fileName: sanitizedFileName,
          fileType: file.mimetype,
          fileSize: file.size,
          s3Key,
          uploadedBy: recipientId,
        },
      });

      logger.info('Attachment uploaded successfully', {
        attachmentId,
        sessionId,
        s3Key,
        fileSize: file.size,
      });

      return this.mapDatabaseToAttachment(attachment);
    } catch (error) {
      logger.error('Error uploading attachment', {
        sessionId,
        recipientId,
        fileName: file.originalname,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Generate presigned URL for direct S3 upload
  async generatePresignedUploadUrl(
    sessionId: string,
    fileName: string,
    fileType: string,
    fileSize: number
  ): Promise<UploadAttachmentResponse> {
    try {
      // Validate session exists
      const session = await this.prisma.workflowSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        throw new NotFoundError('Workflow session not found');
      }

      // Validate file type and size
      this.validateFile(fileName, fileType, fileSize);

      // Generate attachment metadata
      const attachmentId = generateId();
      const sanitizedFileName = sanitizeFilename(fileName);
      const fileExtension = getFileExtension(fileName);
      const s3Key = `documents/${sessionId}/attachments/${attachmentId}.${fileExtension}`;

      // Create attachment record (pending upload)
      const attachment = await this.prisma.attachment.create({
        data: {
          id: attachmentId,
          sessionId,
          fileName: sanitizedFileName,
          fileType,
          fileSize,
          s3Key,
        },
      });

      // Generate presigned URL with additional conditions for multipart if needed
      const isMultipart = fileSize > 5 * 1024 * 1024; // 5MB threshold
      const command = new PutObjectCommand({
        Bucket: config.aws.s3.attachments,
        Key: s3Key,
        ContentType: fileType,
        ContentLength: fileSize,
        ServerSideEncryption: 'AES256',
        Metadata: {
          'session-id': sessionId,
          'attachment-id': attachmentId,
          'original-filename': sanitizedFileName,
        },
        // Add conditions for upload integrity
        ChecksumAlgorithm: 'SHA256',
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { 
        expiresIn: 900 // 15 minutes for security
      });

      logger.info('Presigned upload URL generated', {
        attachmentId,
        sessionId,
        fileName: sanitizedFileName,
        fileSize,
        isMultipart,
      });

      return {
        attachment: this.mapDatabaseToAttachment(attachment),
        uploadUrl,
        isMultipart,
      };
    } catch (error) {
      logger.error('Error generating presigned upload URL', {
        sessionId,
        fileName,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Confirm successful upload and validate file
  async confirmUpload(attachmentId: string): Promise<Attachment> {
    try {
      const attachment = await this.prisma.attachment.findUnique({
        where: { id: attachmentId }
      });

      if (!attachment) {
        throw new NotFoundError('Attachment not found');
      }

      // Verify file exists in S3
      const fileExists = await this.checkFileExists(attachment.s3Key);
      if (!fileExists) {
        // Clean up database record if file upload failed
        await this.prisma.attachment.delete({
          where: { id: attachmentId }
        });
        throw new ValidationError('File upload verification failed');
      }

      // Get actual file size from S3 to verify
      const headCommand = new HeadObjectCommand({
        Bucket: config.aws.s3.attachments,
        Key: attachment.s3Key,
      });
      
      const response = await this.s3Client.send(headCommand);
      const actualFileSize = response.ContentLength || 0;

      // Validate file size matches expected
      if (Math.abs(actualFileSize - attachment.fileSize) > 1024) { // Allow 1KB difference
        logger.warn('File size mismatch detected', {
          attachmentId,
          expected: attachment.fileSize,
          actual: actualFileSize,
        });
      }

      // Update attachment status and metadata
      const updatedAttachment = await this.prisma.attachment.update({
        where: { id: attachmentId },
        data: {
          uploadedAt: new Date(),
          fileSize: actualFileSize, // Use actual size
        },
      });

      logger.info('Upload confirmed', {
        attachmentId,
        s3Key: attachment.s3Key,
        fileSize: actualFileSize,
      });

      return this.mapDatabaseToAttachment(updatedAttachment);
    } catch (error) {
      logger.error('Error confirming upload', {
        attachmentId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Get attachments for a session
  async getAttachments(sessionId: string): Promise<Attachment[]> {
    try {
      logger.debug('Retrieving attachments for session', { sessionId });

      const attachments = await this.prisma.attachment.findMany({
        where: { sessionId },
        orderBy: { uploadedAt: 'desc' },
        include: {
          uploader: {
            select: {
              id: true,
              partyName: true,
              email: true,
              recipientType: true,
            }
          }
        }
      });

      return attachments.map(this.mapDatabaseToAttachment);
    } catch (error) {
      logger.error('Error retrieving attachments', {
        sessionId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Generate presigned URL for downloading attachment
  async getAttachmentDownloadUrl(attachmentId: string): Promise<string> {
    try {
      const attachment = await this.prisma.attachment.findUnique({
        where: { id: attachmentId }
      });

      if (!attachment) {
        throw new NotFoundError('Attachment not found');
      }

      // Generate presigned URL for download
      const command = new GetObjectCommand({
        Bucket: config.aws.s3.attachments,
        Key: attachment.s3Key,
        ResponseContentDisposition: `attachment; filename="${attachment.fileName}"`,
      });

      const downloadUrl = await getSignedUrl(this.s3Client, command, { 
        expiresIn: 3600 // 1 hour
      });

      logger.info('Download URL generated', {
        attachmentId,
        fileName: attachment.fileName,
      });

      return downloadUrl;
    } catch (error) {
      logger.error('Error generating download URL', {
        attachmentId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Delete attachment
  async deleteAttachment(attachmentId: string, userId?: string): Promise<void> {
    try {
      logger.info('Deleting attachment', { attachmentId, userId });

      const attachment = await this.prisma.attachment.findUnique({
        where: { id: attachmentId }
      });

      if (!attachment) {
        throw new NotFoundError('Attachment not found');
      }

      // TODO: Add authorization check here
      // if (userId && attachment.uploadedBy !== userId) {
      //   throw new ForbiddenError('You can only delete your own attachments');
      // }

      // Delete from S3
      const deleteCommand = new DeleteObjectCommand({
        Bucket: config.aws.s3.attachments,
        Key: attachment.s3Key,
      });

      await this.s3Client.send(deleteCommand);

      // Delete from database
      await this.prisma.attachment.delete({
        where: { id: attachmentId }
      });

      logger.info('Attachment deleted successfully', {
        attachmentId,
        s3Key: attachment.s3Key,
      });
    } catch (error) {
      logger.error('Error deleting attachment', {
        attachmentId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Get attachment metadata
  async getAttachmentById(attachmentId: string): Promise<Attachment | null> {
    try {
      const attachment = await this.prisma.attachment.findUnique({
        where: { id: attachmentId },
        include: {
          uploader: {
            select: {
              id: true,
              partyName: true,
              email: true,
              recipientType: true,
            }
          }
        }
      });

      if (!attachment) {
        return null;
      }

      return this.mapDatabaseToAttachment(attachment);
    } catch (error) {
      logger.error('Error retrieving attachment by ID', {
        attachmentId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Check if file exists in S3
  async checkFileExists(s3Key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: config.aws.s3.attachments,
        Key: s3Key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  // Private helper methods
  private async uploadToS3(key: string, buffer: Buffer, contentType: string): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: config.aws.s3.attachments,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      });

      await this.s3Client.send(command);
    } catch (error) {
      logger.error('S3 upload failed', {
        key,
        contentType,
        error: (error as Error).message,
      });
      throw new ApiError(500, 'Failed to upload file to storage');
    }
  }

  private validateFile(fileName: string, fileType: string, fileSize: number): void {
    // File size validation
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (fileSize <= 0) {
      throw new ValidationError('File size must be greater than 0');
    }
    if (fileSize > maxSize) {
      throw new ValidationError(`File size too large. Maximum allowed: ${formatFileSize(maxSize)}`);
    }

    // File type validation
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png', 
      'image/gif',
      'image/webp',
      'image/bmp',
    ];
    // PDF support commented out for MVP - only images allowed
    // 'application/pdf',

    if (!allowedMimeTypes.includes(fileType)) {
      throw new ValidationError(`File type not allowed. Allowed types: images only (JPEG, PNG, GIF, WebP, BMP)`);
    }

    // File extension validation
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    // PDF extension commented out for MVP
    // 'pdf'
    const fileExtension = getFileExtension(fileName).toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      throw new ValidationError(`File extension not allowed: ${fileExtension}. Allowed: ${allowedExtensions.join(', ')}`);
    }

    // Cross-validate MIME type and extension
    const mimeExtensionMap: { [key: string]: string[] } = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/gif': ['gif'],
      'image/webp': ['webp'],
      'image/bmp': ['bmp'],
      // 'application/pdf': ['pdf']
    };

    const expectedExtensions = mimeExtensionMap[fileType];
    if (!expectedExtensions || !expectedExtensions.includes(fileExtension)) {
      throw new ValidationError(`File extension ${fileExtension} does not match MIME type ${fileType}`);
    }

    // Filename validation
    if (!fileName || fileName.trim().length === 0) {
      throw new ValidationError('Filename is required');
    }

    if (fileName.length > 255) {
      throw new ValidationError('Filename too long (maximum 255 characters)');
    }

    // Check for potentially dangerous filenames
    const dangerousPatterns = [
      /^\./,           // Hidden files
      /\.\./,          // Directory traversal
      /[<>:"|?*]/,     // Windows invalid characters
      /\x00/,          // Null bytes
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(fileName)) {
        throw new ValidationError('Filename contains invalid characters');
      }
    }
  }

  // Validate file magic numbers (for enhanced security)
  private validateFileMagicNumbers(buffer: Buffer, expectedMimeType: string): boolean {
    if (buffer.length < 8) return false;

    const magicNumbers: { [key: string]: Buffer[] } = {
      'image/jpeg': [
        Buffer.from([0xFF, 0xD8, 0xFF]),
      ],
      'image/png': [
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
      ],
      'image/gif': [
        Buffer.from('GIF87a'),
        Buffer.from('GIF89a'),
      ],
      'image/webp': [
        // WEBP files start with RIFF and contain WEBP
        // We'll check for RIFF at start and WEBP at position 8
        Buffer.from('RIFF'),
      ],
      'image/bmp': [
        Buffer.from([0x42, 0x4D]), // BM
      ],
    };

    const expectedMagics = magicNumbers[expectedMimeType];
    if (!expectedMagics) return true; // Unknown type, skip validation

    for (const magic of expectedMagics) {
      if (expectedMimeType === 'image/webp') {
        // Special case for WebP - check RIFF at start and WEBP at position 8
        if (buffer.subarray(0, 4).equals(magic) && 
            buffer.subarray(8, 12).equals(Buffer.from('WEBP'))) {
          return true;
        }
      } else {
        if (buffer.subarray(0, magic.length).equals(magic)) {
          return true;
        }
      }
    }

    return false;
  }

  private mapDatabaseToAttachment(dbAttachment: any): Attachment {
    return {
      id: dbAttachment.id,
      sessionId: dbAttachment.sessionId || dbAttachment.session_id,
      recipientId: dbAttachment.recipientId || dbAttachment.recipient_id,
      fileName: dbAttachment.fileName || dbAttachment.file_name,
      fileType: dbAttachment.fileType || dbAttachment.file_type,
      fileSize: dbAttachment.fileSize || dbAttachment.file_size,
      s3Key: dbAttachment.s3Key || dbAttachment.s3_key,
      uploadedAt: new Date(dbAttachment.uploadedAt || dbAttachment.uploaded_at),
      uploadedBy: dbAttachment.uploadedBy || dbAttachment.uploaded_by,
    };
  }
}