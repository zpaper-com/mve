import { PrismaClient } from '@prisma/client';
import { 
  WorkflowSession, 
  Recipient, 
  CreateWorkflowRequest, 
  CreateRecipientRequest,
  WorkflowStatus, 
  RecipientStatus, 
  RecipientType,
  WorkflowStatusResponse,
  NotFoundError,
  ValidationError,
  ApiError
} from '../types';
import { logger } from '../config/logger';
import { generateUniqueUrl, generateId, addHours, isExpired } from '../utils';
import { RedisService } from '../config/redis';
import { EmailService } from './emailService';

export class WorkflowService {
  constructor(
    private prisma: PrismaClient,
    private redisService: RedisService,
    private emailService: EmailService
  ) {}

  // Create a new workflow session
  async createWorkflow(request: CreateWorkflowRequest): Promise<WorkflowSession> {
    try {
      logger.info('Creating new workflow session', {
        recipientCount: request.recipients.length,
      });

      // Validate recipients
      this.validateRecipients(request.recipients);

      // Create workflow session
      const sessionId = generateId();
      const documentUrl = 'https://qr.md/kb/books/merx.pdf'; // Default document

      const session = await this.prisma.workflowSession.create({
        data: {
          id: sessionId,
          documentUrl,
          status: WorkflowStatus.ACTIVE,
          metadata: request.metadata || {},
          recipients: {
            create: request.recipients.map((recipient, index) => ({
              id: generateId(),
              orderIndex: index,
              recipientType: recipient.recipientType,
              partyName: recipient.partyName,
              email: recipient.email,
              mobile: recipient.mobile,
              npi: recipient.npi,
              uniqueUrl: generateUniqueUrl(),
              status: index === 0 ? RecipientStatus.NOTIFIED : RecipientStatus.PENDING,
            }))
          }
        },
        include: {
          recipients: {
            orderBy: { orderIndex: 'asc' }
          },
          attachments: true,
        }
      });

      // Cache workflow state
      await this.cacheWorkflowState(sessionId, session);

      // Send notification to first recipient
      const firstRecipient = session.recipients[0];
      if (firstRecipient && firstRecipient.email) {
        await this.emailService.sendWorkflowNotification(
          firstRecipient,
          session,
          true // isFirst
        );
      }

      logger.info('Workflow session created successfully', {
        sessionId,
        recipientCount: session.recipients.length,
        firstRecipientEmail: firstRecipient?.email,
      });

      return this.mapDatabaseToWorkflowSession(session);
    } catch (error) {
      logger.error('Error creating workflow session', {
        error: (error as Error).message,
        recipients: request.recipients.length,
      });
      throw error;
    }
  }

  // Get workflow session by unique URL
  async getWorkflowByUrl(uniqueUrl: string): Promise<WorkflowStatusResponse> {
    try {
      logger.debug('Retrieving workflow by unique URL', { uniqueUrl });

      // Find recipient by unique URL
      const recipient = await this.prisma.recipient.findUnique({
        where: { uniqueUrl },
        include: {
          session: {
            include: {
              recipients: {
                orderBy: { orderIndex: 'asc' }
              },
              attachments: true,
            }
          }
        }
      });

      if (!recipient) {
        throw new NotFoundError('Workflow session not found');
      }

      const session = recipient.session;

      // Check if workflow is expired (48 hours timeout)
      const createdAt = new Date(session.createdAt);
      const expirationTime = addHours(createdAt, 48);
      
      if (isExpired(expirationTime) && session.status === WorkflowStatus.ACTIVE) {
        await this.expireWorkflow(session.id);
        throw new ApiError(410, 'Workflow session has expired');
      }

      // Update recipient access time
      if (!recipient.accessedAt) {
        await this.prisma.recipient.update({
          where: { id: recipient.id },
          data: { 
            accessedAt: new Date(),
            status: RecipientStatus.ACCESSED,
          }
        });

        logger.info('Recipient accessed workflow', {
          recipientId: recipient.id,
          sessionId: session.id,
          recipientEmail: recipient.email,
        });
      }

      // Prepare response
      const completedRecipients = session.recipients.filter(r => 
        r.status === RecipientStatus.COMPLETED
      );
      const pendingRecipients = session.recipients.filter(r => 
        r.status === RecipientStatus.PENDING || r.status === RecipientStatus.NOTIFIED
      );

      const response: WorkflowStatusResponse = {
        session: this.mapDatabaseToWorkflowSession(session),
        currentRecipient: this.mapDatabaseToRecipient(recipient),
        completedRecipients: completedRecipients.map(this.mapDatabaseToRecipient),
        pendingRecipients: pendingRecipients.map(this.mapDatabaseToRecipient),
      };

      return response;
    } catch (error) {
      logger.error('Error retrieving workflow by URL', {
        uniqueUrl,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Submit workflow data for a recipient
  async submitWorkflow(
    uniqueUrl: string, 
    formData: Record<string, any>
  ): Promise<WorkflowStatusResponse> {
    try {
      logger.info('Submitting workflow data', { uniqueUrl });

      // Get recipient and session
      const recipient = await this.prisma.recipient.findUnique({
        where: { uniqueUrl },
        include: {
          session: {
            include: {
              recipients: {
                orderBy: { orderIndex: 'asc' }
              }
            }
          }
        }
      });

      if (!recipient) {
        throw new NotFoundError('Workflow session not found');
      }

      // Validate submission
      if (recipient.status === RecipientStatus.COMPLETED) {
        throw new ValidationError('This workflow step has already been completed');
      }

      if (recipient.session.status !== WorkflowStatus.ACTIVE) {
        throw new ValidationError('This workflow session is no longer active');
      }

      // Update recipient with form data
      await this.prisma.recipient.update({
        where: { id: recipient.id },
        data: {
          formData,
          completedAt: new Date(),
          status: RecipientStatus.COMPLETED,
        }
      });

      // Find next recipient
      const nextRecipient = recipient.session.recipients.find(r => 
        r.orderIndex === recipient.orderIndex + 1
      );

      if (nextRecipient) {
        // Notify next recipient
        await this.prisma.recipient.update({
          where: { id: nextRecipient.id },
          data: { status: RecipientStatus.NOTIFIED }
        });

        if (nextRecipient.email) {
          const updatedSession = await this.prisma.workflowSession.findUnique({
            where: { id: recipient.sessionId },
            include: {
              recipients: { orderBy: { orderIndex: 'asc' } },
              attachments: true,
            }
          });

          if (updatedSession) {
            await this.emailService.sendWorkflowNotification(
              this.mapDatabaseToRecipient(nextRecipient),
              this.mapDatabaseToWorkflowSession(updatedSession),
              false
            );
          }
        }

        logger.info('Next recipient notified', {
          currentRecipientId: recipient.id,
          nextRecipientId: nextRecipient.id,
          nextRecipientEmail: nextRecipient.email,
        });
      } else {
        // No more recipients - complete workflow
        await this.prisma.workflowSession.update({
          where: { id: recipient.sessionId },
          data: { status: WorkflowStatus.COMPLETED }
        });

        logger.info('Workflow completed', {
          sessionId: recipient.sessionId,
          completedBy: recipient.id,
        });
      }

      // Clear cache
      await this.redisService.del(`workflow:${recipient.sessionId}`);

      // Get updated workflow status
      return this.getWorkflowByUrl(uniqueUrl);
    } catch (error) {
      logger.error('Error submitting workflow', {
        uniqueUrl,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Get workflow session by ID
  async getWorkflowById(sessionId: string): Promise<WorkflowSession | null> {
    try {
      // Check cache first
      const cached = await this.redisService.getWorkflowState(sessionId);
      if (cached) {
        return cached;
      }

      const session = await this.prisma.workflowSession.findUnique({
        where: { id: sessionId },
        include: {
          recipients: {
            orderBy: { orderIndex: 'asc' }
          },
          attachments: true,
        }
      });

      if (!session) return null;

      const workflowSession = this.mapDatabaseToWorkflowSession(session);
      
      // Cache for 1 hour
      await this.cacheWorkflowState(sessionId, workflowSession);

      return workflowSession;
    } catch (error) {
      logger.error('Error retrieving workflow by ID', {
        sessionId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Expire workflow session
  async expireWorkflow(sessionId: string): Promise<void> {
    try {
      await this.prisma.workflowSession.update({
        where: { id: sessionId },
        data: { status: WorkflowStatus.EXPIRED }
      });

      await this.prisma.recipient.updateMany({
        where: { 
          sessionId,
          status: { in: [RecipientStatus.PENDING, RecipientStatus.NOTIFIED, RecipientStatus.ACCESSED] }
        },
        data: { status: RecipientStatus.EXPIRED }
      });

      // Clear cache
      await this.redisService.del(`workflow:${sessionId}`);

      logger.info('Workflow expired', { sessionId });
    } catch (error) {
      logger.error('Error expiring workflow', {
        sessionId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Get workflow statistics
  async getWorkflowStats(sessionId: string): Promise<{
    totalRecipients: number;
    completedRecipients: number;
    pendingRecipients: number;
    currentStep: number;
    completionRate: number;
  }> {
    try {
      const recipients = await this.prisma.recipient.findMany({
        where: { sessionId },
        orderBy: { orderIndex: 'asc' }
      });

      const totalRecipients = recipients.length;
      const completedRecipients = recipients.filter(r => 
        r.status === RecipientStatus.COMPLETED
      ).length;
      const pendingRecipients = totalRecipients - completedRecipients;
      const currentStep = completedRecipients + 1;
      const completionRate = totalRecipients > 0 ? (completedRecipients / totalRecipients) * 100 : 0;

      return {
        totalRecipients,
        completedRecipients,
        pendingRecipients,
        currentStep,
        completionRate: Math.round(completionRate * 100) / 100,
      };
    } catch (error) {
      logger.error('Error getting workflow stats', {
        sessionId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Private helper methods
  private validateRecipients(recipients: CreateRecipientRequest[]): void {
    if (!recipients || recipients.length === 0) {
      throw new ValidationError('At least one recipient is required');
    }

    if (recipients.length > 10) {
      throw new ValidationError('Maximum 10 recipients allowed');
    }

    recipients.forEach((recipient, index) => {
      if (!recipient.recipientType) {
        throw new ValidationError(`Recipient ${index + 1}: recipientType is required`);
      }

      if (!Object.values(RecipientType).includes(recipient.recipientType)) {
        throw new ValidationError(`Recipient ${index + 1}: invalid recipientType`);
      }

      if (!recipient.email && !recipient.mobile) {
        throw new ValidationError(`Recipient ${index + 1}: email or mobile is required`);
      }
    });
  }

  private async cacheWorkflowState(sessionId: string, session: any): Promise<void> {
    try {
      await this.redisService.setWorkflowState(sessionId, session, 3600);
    } catch (error) {
      logger.warn('Failed to cache workflow state', {
        sessionId,
        error: (error as Error).message,
      });
    }
  }

  public mapDatabaseToWorkflowSession(dbSession: any): WorkflowSession {
    return {
      id: dbSession.id,
      documentUrl: dbSession.documentUrl || dbSession.document_url,
      status: dbSession.status as WorkflowStatus,
      createdAt: new Date(dbSession.createdAt || dbSession.created_at),
      updatedAt: new Date(dbSession.updatedAt || dbSession.updated_at),
      metadata: dbSession.metadata,
      recipients: dbSession.recipients?.map(this.mapDatabaseToRecipient) || [],
      attachments: dbSession.attachments?.map((att: any) => ({
        id: att.id,
        sessionId: att.sessionId || att.session_id,
        recipientId: att.recipientId || att.recipient_id,
        fileName: att.fileName || att.file_name,
        fileType: att.fileType || att.file_type,
        fileSize: att.fileSize || att.file_size,
        s3Key: att.s3Key || att.s3_key,
        uploadedAt: new Date(att.uploadedAt || att.uploaded_at),
        uploadedBy: att.uploadedBy || att.uploaded_by,
      })) || [],
    };
  }

  public mapDatabaseToRecipient(dbRecipient: any): Recipient {
    return {
      id: dbRecipient.id,
      sessionId: dbRecipient.sessionId || dbRecipient.session_id,
      orderIndex: dbRecipient.orderIndex || dbRecipient.order_index,
      recipientType: dbRecipient.recipientType || dbRecipient.recipient_type,
      partyName: dbRecipient.partyName || dbRecipient.party_name,
      email: dbRecipient.email,
      mobile: dbRecipient.mobile,
      npi: dbRecipient.npi,
      uniqueUrl: dbRecipient.uniqueUrl || dbRecipient.unique_url,
      status: dbRecipient.status as RecipientStatus,
      accessedAt: dbRecipient.accessedAt ? new Date(dbRecipient.accessedAt || dbRecipient.accessed_at) : undefined,
      completedAt: dbRecipient.completedAt ? new Date(dbRecipient.completedAt || dbRecipient.completed_at) : undefined,
      formData: dbRecipient.formData || dbRecipient.form_data,
      createdAt: new Date(dbRecipient.createdAt || dbRecipient.created_at),
    };
  }
}