import { PrismaClient, Prisma, WorkflowStatus, RecipientStatus, RecipientType } from '@prisma/client';
import { prisma, withTransaction } from '../config/database';
import { createDatabaseLogger } from '../config/logger';
import { encode } from 'base32-encode';
import { randomBytes } from 'crypto';

const dbLogger = createDatabaseLogger();

// Type definitions for enhanced operations
export type WorkflowSessionWithRelations = Prisma.WorkflowSessionGetPayload<{
  include: {
    recipients: true;
    attachments: true;
  };
}>;

export type RecipientWithSession = Prisma.RecipientGetPayload<{
  include: {
    session: true;
  };
}>;

export type AttachmentWithRelations = Prisma.AttachmentGetPayload<{
  include: {
    session: true;
    recipient: true;
    uploader: true;
  };
}>;

// Utility functions for URL generation
export function generateUniqueUrl(): string {
  const buffer = randomBytes(20); // 160 bits for uniqueness
  return encode(buffer, 'RFC4648', { padding: false }).toLowerCase();
}

// Database query utilities with performance optimization
export class DatabaseUtils {
  /**
   * Create a new workflow session with recipients
   */
  static async createWorkflowSession(data: {
    documentUrl: string;
    recipients: Array<{
      recipientType: RecipientType;
      partyName?: string;
      email?: string;
      mobile?: string;
      npi?: string;
    }>;
    metadata?: Prisma.JsonValue;
    createdBy?: string;
    expiresAt?: Date;
  }): Promise<WorkflowSessionWithRelations> {
    return withTransaction(async (tx) => {
      // Create workflow session
      const session = await tx.workflowSession.create({
        data: {
          documentUrl: data.documentUrl,
          metadata: data.metadata,
          createdBy: data.createdBy,
          expiresAt: data.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
          totalRecipients: data.recipients.length,
          status: WorkflowStatus.ACTIVE,
        },
      });

      // Create recipients with unique URLs
      const recipients = await Promise.all(
        data.recipients.map((recipient, index) =>
          tx.recipient.create({
            data: {
              sessionId: session.id,
              orderIndex: index,
              recipientType: recipient.recipientType,
              partyName: recipient.partyName,
              email: recipient.email,
              mobile: recipient.mobile,
              npi: recipient.npi,
              uniqueUrl: generateUniqueUrl(),
              status: index === 0 ? RecipientStatus.PENDING : RecipientStatus.PENDING,
              expiresAt: new Date(Date.now() + (index + 1) * 48 * 60 * 60 * 1000), // 48 hours per step
            },
          })
        )
      );

      // Update session with first recipient
      await tx.workflowSession.update({
        where: { id: session.id },
        data: { currentRecipientOrder: 0 },
      });

      // Create audit log
      await tx.workflowAuditLog.create({
        data: {
          sessionId: session.id,
          eventType: 'WORKFLOW_CREATED',
          eventData: {
            totalRecipients: data.recipients.length,
            documentUrl: data.documentUrl,
            createdBy: data.createdBy,
          },
        },
      });

      return tx.workflowSession.findUniqueOrThrow({
        where: { id: session.id },
        include: {
          recipients: {
            orderBy: { orderIndex: 'asc' },
          },
          attachments: true,
        },
      });
    });
  }

  /**
   * Get workflow session by ID with full relations
   */
  static async getWorkflowSession(sessionId: string): Promise<WorkflowSessionWithRelations | null> {
    const startTime = Date.now();
    
    try {
      const session = await prisma.workflowSession.findUnique({
        where: { id: sessionId },
        include: {
          recipients: {
            orderBy: { orderIndex: 'asc' },
          },
          attachments: {
            orderBy: { uploadedAt: 'desc' },
          },
        },
      });

      const queryTime = Date.now() - startTime;
      dbLogger.debug('Workflow session query completed', {
        sessionId,
        queryTime: `${queryTime}ms`,
        found: !!session,
      });

      return session;
    } catch (error) {
      dbLogger.error('Failed to fetch workflow session', {
        sessionId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get recipient by unique URL with session data
   */
  static async getRecipientByUrl(uniqueUrl: string): Promise<RecipientWithSession | null> {
    const startTime = Date.now();
    
    try {
      const recipient = await prisma.recipient.findUnique({
        where: { uniqueUrl },
        include: {
          session: true,
        },
      });

      const queryTime = Date.now() - startTime;
      dbLogger.debug('Recipient lookup by URL completed', {
        uniqueUrl,
        queryTime: `${queryTime}ms`,
        found: !!recipient,
      });

      return recipient;
    } catch (error) {
      dbLogger.error('Failed to fetch recipient by URL', {
        uniqueUrl,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Update recipient status and form data
   */
  static async updateRecipientProgress(
    recipientId: string,
    data: {
      status?: RecipientStatus;
      formData?: Prisma.JsonValue;
      completedAt?: Date;
      accessedAt?: Date;
    }
  ): Promise<RecipientWithSession> {
    return withTransaction(async (tx) => {
      // Update recipient
      const recipient = await tx.recipient.update({
        where: { id: recipientId },
        data: {
          ...data,
          ...(data.status === RecipientStatus.COMPLETED && !data.completedAt
            ? { completedAt: new Date() }
            : {}),
          ...(data.status === RecipientStatus.ACCESSED && !data.accessedAt
            ? { accessedAt: new Date() }
            : {}),
        },
        include: {
          session: true,
        },
      });

      // Create audit log
      await tx.workflowAuditLog.create({
        data: {
          sessionId: recipient.sessionId,
          recipientId: recipient.id,
          eventType: `RECIPIENT_${data.status?.toUpperCase() || 'UPDATED'}`,
          eventData: {
            previousStatus: recipient.status,
            newStatus: data.status,
            hasFormData: !!data.formData,
          },
        },
      });

      // Check if workflow is complete
      if (data.status === RecipientStatus.COMPLETED) {
        const sessionStats = await tx.recipient.groupBy({
          by: ['status'],
          where: { sessionId: recipient.sessionId },
          _count: true,
        });

        const completedCount = sessionStats.find(stat => stat.status === RecipientStatus.COMPLETED)?._count || 0;
        const totalCount = sessionStats.reduce((sum, stat) => sum + stat._count, 0);

        if (completedCount === totalCount) {
          await tx.workflowSession.update({
            where: { id: recipient.sessionId },
            data: { status: WorkflowStatus.COMPLETED },
          });

          await tx.workflowAuditLog.create({
            data: {
              sessionId: recipient.sessionId,
              eventType: 'WORKFLOW_COMPLETED',
              eventData: {
                completedRecipients: completedCount,
                totalRecipients: totalCount,
              },
            },
          });
        }
      }

      return recipient;
    });
  }

  /**
   * Create attachment with metadata
   */
  static async createAttachment(data: {
    sessionId: string;
    recipientId?: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    s3Key: string;
    s3Bucket: string;
    uploadedBy?: string;
    checksum?: string;
  }): Promise<AttachmentWithRelations> {
    return withTransaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          ...data,
          scanStatus: 'pending', // Will be updated by virus scanner
        },
        include: {
          session: true,
          recipient: true,
          uploader: true,
        },
      });

      // Create audit log
      await tx.workflowAuditLog.create({
        data: {
          sessionId: data.sessionId,
          recipientId: data.recipientId,
          eventType: 'ATTACHMENT_UPLOADED',
          eventData: {
            fileName: data.fileName,
            fileSize: data.fileSize,
            fileType: data.fileType,
          },
        },
      });

      return attachment;
    });
  }

  /**
   * Get workflow statistics for dashboard
   */
  static async getWorkflowStats(timeRange?: { start: Date; end: Date }) {
    const whereClause = timeRange
      ? {
          createdAt: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
        }
      : {};

    const [
      totalWorkflows,
      statusStats,
      recipientTypeStats,
      attachmentStats,
    ] = await Promise.all([
      prisma.workflowSession.count({ where: whereClause }),
      prisma.workflowSession.groupBy({
        by: ['status'],
        where: whereClause,
        _count: true,
      }),
      prisma.recipient.groupBy({
        by: ['recipientType'],
        where: timeRange
          ? {
              createdAt: {
                gte: timeRange.start,
                lte: timeRange.end,
              },
            }
          : {},
        _count: true,
      }),
      prisma.attachment.aggregate({
        where: timeRange
          ? {
              uploadedAt: {
                gte: timeRange.start,
                lte: timeRange.end,
              },
            }
          : {},
        _count: true,
        _sum: { fileSize: true },
        _avg: { fileSize: true },
      }),
    ]);

    return {
      totalWorkflows,
      statusBreakdown: statusStats.reduce(
        (acc, stat) => ({ ...acc, [stat.status]: stat._count }),
        {}
      ),
      recipientTypeBreakdown: recipientTypeStats.reduce(
        (acc, stat) => ({ ...acc, [stat.recipientType]: stat._count }),
        {}
      ),
      attachments: {
        total: attachmentStats._count,
        totalSize: attachmentStats._sum.fileSize || 0,
        averageSize: attachmentStats._avg.fileSize || 0,
      },
    };
  }

  /**
   * Clean up expired workflows
   */
  static async cleanupExpiredWorkflows(): Promise<{ expiredCount: number; recipientCount: number }> {
    const now = new Date();
    
    return withTransaction(async (tx) => {
      // Find expired workflows
      const expiredSessions = await tx.workflowSession.findMany({
        where: {
          OR: [
            {
              expiresAt: {
                lte: now,
              },
              status: {
                not: WorkflowStatus.COMPLETED,
              },
            },
            {
              recipients: {
                some: {
                  expiresAt: {
                    lte: now,
                  },
                  status: {
                    notIn: [RecipientStatus.COMPLETED, RecipientStatus.EXPIRED],
                  },
                },
              },
            },
          ],
        },
        include: {
          recipients: true,
        },
      });

      let expiredWorkflowCount = 0;
      let expiredRecipientCount = 0;

      for (const session of expiredSessions) {
        // Update expired recipients
        const expiredRecipients = session.recipients.filter(
          (r) => r.expiresAt && r.expiresAt <= now && 
                 r.status !== RecipientStatus.COMPLETED &&
                 r.status !== RecipientStatus.EXPIRED
        );

        if (expiredRecipients.length > 0) {
          await tx.recipient.updateMany({
            where: {
              id: {
                in: expiredRecipients.map(r => r.id),
              },
            },
            data: {
              status: RecipientStatus.EXPIRED,
            },
          });

          expiredRecipientCount += expiredRecipients.length;
        }

        // Update workflow if expired
        if (session.expiresAt && session.expiresAt <= now) {
          await tx.workflowSession.update({
            where: { id: session.id },
            data: { status: WorkflowStatus.EXPIRED },
          });

          expiredWorkflowCount++;
        }

        // Create audit logs
        await tx.workflowAuditLog.create({
          data: {
            sessionId: session.id,
            eventType: 'WORKFLOW_EXPIRED',
            eventData: {
              expiredRecipients: expiredRecipients.length,
              totalRecipients: session.recipients.length,
            },
          },
        });
      }

      dbLogger.info('Cleanup completed', {
        expiredWorkflows: expiredWorkflowCount,
        expiredRecipients: expiredRecipientCount,
      });

      return {
        expiredCount: expiredWorkflowCount,
        recipientCount: expiredRecipientCount,
      };
    });
  }

  /**
   * Get slow query performance insights
   */
  static async analyzeQueryPerformance() {
    try {
      // This would need to be run with appropriate database privileges
      const slowQueries = await prisma.$queryRaw`
        SELECT 
          query,
          mean_exec_time,
          calls,
          total_exec_time,
          rows
        FROM pg_stat_statements 
        WHERE mean_exec_time > 100
        ORDER BY mean_exec_time DESC 
        LIMIT 10;
      `;

      return slowQueries;
    } catch (error) {
      dbLogger.warn('Could not analyze query performance - pg_stat_statements may not be enabled', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Get database health metrics
   */
  static async getDatabaseHealth() {
    try {
      const [
        tableStats,
        indexStats,
        connectionCount,
      ] = await Promise.all([
        prisma.$queryRaw`
          SELECT 
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_live_tup as live_tuples,
            n_dead_tup as dead_tuples
          FROM pg_stat_user_tables
          ORDER BY n_live_tup DESC;
        `,
        prisma.$queryRaw`
          SELECT 
            schemaname,
            tablename,
            indexname,
            idx_tup_read as tuples_read,
            idx_tup_fetch as tuples_fetched
          FROM pg_stat_user_indexes
          WHERE idx_tup_read > 0
          ORDER BY idx_tup_read DESC
          LIMIT 20;
        `,
        prisma.$queryRaw`
          SELECT count(*) as active_connections 
          FROM pg_stat_activity 
          WHERE state = 'active';
        `,
      ]);

      return {
        tableStats,
        indexStats,
        connectionCount,
        timestamp: new Date(),
      };
    } catch (error) {
      dbLogger.error('Failed to get database health metrics', {
        error: (error as Error).message,
      });
      throw error;
    }
  }
}

// Export commonly used functions
export {
  WorkflowStatus,
  RecipientStatus,
  RecipientType,
  prisma,
  withTransaction,
};