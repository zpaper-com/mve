import { PrismaClient } from '@prisma/client';
import { RedisService } from '../config/redis';
import { EmailService } from './emailService';
import { WorkflowService } from './workflowService';
import { logger } from '../config/logger';
import { addHours, addDays, isExpired } from '../utils';
import { RecipientStatus, WorkflowStatus } from '../types';

export class WorkflowJobsService {
  private readonly REMINDER_DELAY_HOURS = 24;
  private readonly EXPIRATION_DELAY_HOURS = 48;
  private readonly BATCH_SIZE = 100;

  constructor(
    private prisma: PrismaClient,
    private redisService: RedisService,
    private emailService: EmailService,
    private workflowService: WorkflowService
  ) {}

  // Schedule reminder for a specific recipient
  async scheduleReminder(recipientId: string): Promise<void> {
    try {
      const recipient = await this.prisma.recipient.findUnique({
        where: { id: recipientId },
        include: {
          session: {
            include: {
              recipients: { orderBy: { orderIndex: 'asc' } },
              attachments: true,
            },
          },
        },
      });

      if (!recipient) {
        logger.warn('Recipient not found for reminder scheduling', { recipientId });
        return;
      }

      const reminderTime = addHours(new Date(), this.REMINDER_DELAY_HOURS);
      const reminderKey = `reminder:${recipientId}:${Date.now()}`;

      // Store reminder job in Redis with TTL
      await this.redisService.set(
        reminderKey,
        JSON.stringify({
          recipientId,
          sessionId: recipient.sessionId,
          scheduledAt: new Date().toISOString(),
          executeAt: reminderTime.toISOString(),
          type: 'reminder',
        }),
        this.REMINDER_DELAY_HOURS * 60 * 60 // TTL in seconds
      );

      logger.info('Reminder scheduled', {
        recipientId,
        sessionId: recipient.sessionId,
        reminderTime: reminderTime.toISOString(),
      });
    } catch (error) {
      logger.error('Failed to schedule reminder', {
        recipientId,
        error: (error as Error).message,
      });
    }
  }

  // Schedule expiration for a workflow session
  async scheduleWorkflowExpiration(sessionId: string): Promise<void> {
    try {
      const session = await this.prisma.workflowSession.findUnique({
        where: { id: sessionId },
        include: {
          recipients: { orderBy: { orderIndex: 'asc' } },
          attachments: true,
        },
      });

      if (!session) {
        logger.warn('Session not found for expiration scheduling', { sessionId });
        return;
      }

      const expirationTime = addHours(session.createdAt, this.EXPIRATION_DELAY_HOURS);
      const expirationKey = `expiration:${sessionId}:${Date.now()}`;

      // Store expiration job in Redis with TTL
      await this.redisService.set(
        expirationKey,
        JSON.stringify({
          sessionId,
          scheduledAt: new Date().toISOString(),
          executeAt: expirationTime.toISOString(),
          type: 'expiration',
        }),
        this.EXPIRATION_DELAY_HOURS * 60 * 60 // TTL in seconds
      );

      // Update session expiration time in database
      await this.prisma.workflowSession.update({
        where: { id: sessionId },
        data: { expiresAt: expirationTime },
      });

      logger.info('Workflow expiration scheduled', {
        sessionId,
        expirationTime: expirationTime.toISOString(),
      });
    } catch (error) {
      logger.error('Failed to schedule workflow expiration', {
        sessionId,
        error: (error as Error).message,
      });
    }
  }

  // Process pending reminders
  async processReminders(): Promise<void> {
    try {
      logger.info('Processing workflow reminders');

      // Get recipients who need reminders (24 hours after notification, not yet completed)
      const reminderCutoff = addHours(new Date(), -this.REMINDER_DELAY_HOURS);

      const pendingReminders = await this.prisma.recipient.findMany({
        where: {
          status: {
            in: [RecipientStatus.PENDING, RecipientStatus.ACCESSED],
          },
          emailSentAt: {
            lte: reminderCutoff,
          },
          reminderCount: {
            lt: 2, // Maximum 2 reminders
          },
          session: {
            status: WorkflowStatus.ACTIVE,
          },
        },
        include: {
          session: {
            include: {
              recipients: { orderBy: { orderIndex: 'asc' } },
              attachments: true,
            },
          },
        },
        take: this.BATCH_SIZE,
      });

      if (pendingReminders.length === 0) {
        logger.info('No pending reminders found');
        return;
      }

      logger.info(`Processing ${pendingReminders.length} reminder notifications`);

      // Send reminders in batches
      const emailTasks = pendingReminders
        .filter(recipient => recipient.email)
        .map(recipient => ({
          recipient: this.workflowService.mapDatabaseToRecipient(recipient),
          session: this.workflowService.mapDatabaseToWorkflowSession(recipient.session),
          type: 'reminder' as const,
        }));

      await this.emailService.batchSendEmails(emailTasks);

      // Update reminder count for all processed recipients
      const recipientIds = pendingReminders.map(r => r.id);
      await this.prisma.recipient.updateMany({
        where: { id: { in: recipientIds } },
        data: { 
          reminderCount: { increment: 1 },
        },
      });

      logger.info(`Sent ${emailTasks.length} reminder notifications`);
    } catch (error) {
      logger.error('Failed to process reminders', {
        error: (error as Error).message,
      });
    }
  }

  // Process workflow expirations
  async processExpirations(): Promise<void> {
    try {
      logger.info('Processing workflow expirations');

      // Get workflows that should be expired (48 hours after creation)
      const expirationCutoff = addHours(new Date(), -this.EXPIRATION_DELAY_HOURS);

      const expiredSessions = await this.prisma.workflowSession.findMany({
        where: {
          status: WorkflowStatus.ACTIVE,
          createdAt: {
            lte: expirationCutoff,
          },
        },
        include: {
          recipients: { 
            orderBy: { orderIndex: 'asc' },
            where: {
              status: {
                in: [
                  RecipientStatus.PENDING,
                  RecipientStatus.ACCESSED,
                  RecipientStatus.IN_PROGRESS,
                ],
              },
            },
          },
          attachments: true,
        },
        take: this.BATCH_SIZE,
      });

      if (expiredSessions.length === 0) {
        logger.info('No expired workflows found');
        return;
      }

      logger.info(`Processing ${expiredSessions.length} expired workflows`);

      for (const session of expiredSessions) {
        try {
          // Expire the workflow
          await this.workflowService.expireWorkflow(session.id);

          // Send expiration notifications to incomplete recipients
          const incompleteRecipients = session.recipients.filter(r => r.email);

          if (incompleteRecipients.length > 0) {
            const emailTasks = incompleteRecipients.map(recipient => ({
              recipient: this.workflowService.mapDatabaseToRecipient(recipient),
              session: this.workflowService.mapDatabaseToWorkflowSession(session),
              type: 'expiration' as const,
            }));

            await this.emailService.batchSendEmails(emailTasks);
          }

          logger.info('Workflow expired and notifications sent', {
            sessionId: session.id,
            notificationsSent: incompleteRecipients.length,
          });
        } catch (error) {
          logger.error('Failed to expire individual workflow', {
            sessionId: session.id,
            error: (error as Error).message,
          });
          continue;
        }
      }

      logger.info(`Processed ${expiredSessions.length} workflow expirations`);
    } catch (error) {
      logger.error('Failed to process expirations', {
        error: (error as Error).message,
      });
    }
  }

  // Process stale workflows (older than 7 days)
  async processStaleWorkflows(): Promise<void> {
    try {
      logger.info('Processing stale workflow cleanup');

      const staleDate = addDays(new Date(), -7);

      // Find workflows older than 7 days that are completed or expired
      const staleWorkflows = await this.prisma.workflowSession.findMany({
        where: {
          status: {
            in: [WorkflowStatus.COMPLETED, WorkflowStatus.EXPIRED, WorkflowStatus.CANCELLED],
          },
          updatedAt: {
            lte: staleDate,
          },
        },
        select: { id: true },
        take: this.BATCH_SIZE,
      });

      if (staleWorkflows.length === 0) {
        logger.info('No stale workflows found');
        return;
      }

      logger.info(`Found ${staleWorkflows.length} stale workflows for cleanup`);

      // Clear Redis cache for stale workflows
      const cacheKeys = staleWorkflows.map(w => `workflow:${w.id}`);
      await this.redisService.del(...cacheKeys);

      // Note: We don't delete from database for audit purposes
      // But we clear the cache to free up memory

      logger.info(`Cleaned up cache for ${staleWorkflows.length} stale workflows`);
    } catch (error) {
      logger.error('Failed to process stale workflows', {
        error: (error as Error).message,
      });
    }
  }

  // Clean up expired reminder and expiration jobs from Redis
  async cleanupExpiredJobs(): Promise<void> {
    try {
      logger.info('Cleaning up expired Redis jobs');

      // Get all reminder and expiration keys
      const reminderKeys = await this.redisService.keys('reminder:*');
      const expirationKeys = await this.redisService.keys('expiration:*');
      const allJobKeys = [...reminderKeys, ...expirationKeys];

      if (allJobKeys.length === 0) {
        logger.info('No job keys found in Redis');
        return;
      }

      let cleanedCount = 0;

      // Check each job and clean up expired ones
      for (const key of allJobKeys) {
        try {
          const jobData = await this.redisService.get(key);
          if (!jobData) {
            // Key already expired or deleted
            cleanedCount++;
            continue;
          }

          const job = JSON.parse(jobData);
          const executeAt = new Date(job.executeAt);

          // If execution time has passed, process or clean up the job
          if (isExpired(executeAt)) {
            await this.redisService.del(key);
            cleanedCount++;
          }
        } catch (error) {
          // Clean up malformed job data
          await this.redisService.del(key);
          cleanedCount++;
        }
      }

      logger.info(`Cleaned up ${cleanedCount} expired job keys from Redis`);
    } catch (error) {
      logger.error('Failed to cleanup expired jobs', {
        error: (error as Error).message,
      });
    }
  }

  // Main job runner - call this method periodically (e.g., every 15 minutes)
  async runPeriodicJobs(): Promise<void> {
    logger.info('Starting periodic workflow job processing');

    try {
      // Run all job types in parallel for efficiency
      await Promise.allSettled([
        this.processReminders(),
        this.processExpirations(),
        this.processStaleWorkflows(),
        this.cleanupExpiredJobs(),
      ]);

      logger.info('Completed periodic workflow job processing');
    } catch (error) {
      logger.error('Error in periodic job processing', {
        error: (error as Error).message,
      });
    }
  }

  // Get job statistics for monitoring
  async getJobStatistics(): Promise<{
    pendingReminders: number;
    pendingExpirations: number;
    totalActiveWorkflows: number;
    expiredWorkflows: number;
  }> {
    try {
      const reminderCutoff = addHours(new Date(), -this.REMINDER_DELAY_HOURS);
      const expirationCutoff = addHours(new Date(), -this.EXPIRATION_DELAY_HOURS);

      const [
        pendingReminders,
        pendingExpirations,
        totalActiveWorkflows,
        expiredWorkflows,
      ] = await Promise.all([
        // Count recipients needing reminders
        this.prisma.recipient.count({
          where: {
            status: {
              in: [RecipientStatus.PENDING, RecipientStatus.ACCESSED],
            },
            emailSentAt: {
              lte: reminderCutoff,
            },
            reminderCount: {
              lt: 2,
            },
            session: {
              status: WorkflowStatus.ACTIVE,
            },
          },
        }),
        
        // Count workflows needing expiration
        this.prisma.workflowSession.count({
          where: {
            status: WorkflowStatus.ACTIVE,
            createdAt: {
              lte: expirationCutoff,
            },
          },
        }),
        
        // Count total active workflows
        this.prisma.workflowSession.count({
          where: {
            status: WorkflowStatus.ACTIVE,
          },
        }),
        
        // Count expired workflows
        this.prisma.workflowSession.count({
          where: {
            status: WorkflowStatus.EXPIRED,
          },
        }),
      ]);

      return {
        pendingReminders,
        pendingExpirations,
        totalActiveWorkflows,
        expiredWorkflows,
      };
    } catch (error) {
      logger.error('Failed to get job statistics', {
        error: (error as Error).message,
      });
      return {
        pendingReminders: 0,
        pendingExpirations: 0,
        totalActiveWorkflows: 0,
        expiredWorkflows: 0,
      };
    }
  }
}