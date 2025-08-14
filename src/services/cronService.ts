import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { RedisService } from '../config/redis';
import { EmailService } from './emailService';
import { WorkflowService } from './workflowService';
import { WorkflowJobsService } from './workflowJobsService';
import { logger } from '../config/logger';

export class CronService {
  private isRunning: boolean = false;
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private workflowJobsService: WorkflowJobsService;

  constructor(
    prisma: PrismaClient,
    redisService: RedisService,
    emailService: EmailService,
    workflowService: WorkflowService
  ) {
    this.workflowJobsService = new WorkflowJobsService(
      prisma,
      redisService,
      emailService,
      workflowService
    );
  }

  // Start all cron jobs
  start(): void {
    if (this.isRunning) {
      logger.warn('Cron service is already running');
      return;
    }

    logger.info('Starting cron service');

    // Process workflow jobs every 15 minutes
    this.scheduleJob('workflow-jobs', '*/15 * * * *', async () => {
      await this.workflowJobsService.runPeriodicJobs();
    });

    // Send reminder notifications every hour
    this.scheduleJob('reminders', '0 * * * *', async () => {
      await this.workflowJobsService.processReminders();
    });

    // Process expirations every 30 minutes
    this.scheduleJob('expirations', '*/30 * * * *', async () => {
      await this.workflowJobsService.processExpirations();
    });

    // Clean up stale workflows daily at 2 AM
    this.scheduleJob('cleanup', '0 2 * * *', async () => {
      await this.workflowJobsService.processStaleWorkflows();
      await this.workflowJobsService.cleanupExpiredJobs();
    });

    // Log statistics every hour
    this.scheduleJob('statistics', '0 * * * *', async () => {
      await this.logStatistics();
    });

    this.isRunning = true;
    logger.info('Cron service started successfully');
  }

  // Stop all cron jobs
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Cron service is not running');
      return;
    }

    logger.info('Stopping cron service');

    // Stop all scheduled jobs
    for (const [name, task] of this.jobs) {
      task.stop();
      logger.info(`Stopped cron job: ${name}`);
    }

    this.jobs.clear();
    this.isRunning = false;

    logger.info('Cron service stopped');
  }

  // Schedule a new job
  private scheduleJob(name: string, schedule: string, task: () => Promise<void>): void {
    if (this.jobs.has(name)) {
      logger.warn(`Cron job ${name} is already scheduled`);
      return;
    }

    const cronJob = cron.schedule(schedule, async () => {
      const startTime = Date.now();
      logger.info(`Starting cron job: ${name}`);

      try {
        await task();
        const duration = Date.now() - startTime;
        logger.info(`Completed cron job: ${name} (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`Failed cron job: ${name} (${duration}ms)`, {
          error: (error as Error).message,
        });
      }
    }, {
      scheduled: false, // Don't start immediately
    });

    this.jobs.set(name, cronJob);
    cronJob.start();

    logger.info(`Scheduled cron job: ${name} with schedule: ${schedule}`);
  }

  // Log workflow statistics
  private async logStatistics(): Promise<void> {
    try {
      const stats = await this.workflowJobsService.getJobStatistics();
      
      logger.info('Workflow system statistics', {
        pendingReminders: stats.pendingReminders,
        pendingExpirations: stats.pendingExpirations,
        totalActiveWorkflows: stats.totalActiveWorkflows,
        expiredWorkflows: stats.expiredWorkflows,
      });

      // Log warnings for high numbers
      if (stats.pendingReminders > 100) {
        logger.warn(`High number of pending reminders: ${stats.pendingReminders}`);
      }

      if (stats.pendingExpirations > 50) {
        logger.warn(`High number of pending expirations: ${stats.pendingExpirations}`);
      }

      if (stats.totalActiveWorkflows > 1000) {
        logger.warn(`High number of active workflows: ${stats.totalActiveWorkflows}`);
      }
    } catch (error) {
      logger.error('Failed to log workflow statistics', {
        error: (error as Error).message,
      });
    }
  }

  // Get the status of all cron jobs
  getStatus(): {
    isRunning: boolean;
    jobs: { name: string; running: boolean }[];
  } {
    const jobStatus = Array.from(this.jobs.entries()).map(([name, task]) => ({
      name,
      running: task.getStatus() === 'scheduled',
    }));

    return {
      isRunning: this.isRunning,
      jobs: jobStatus,
    };
  }

  // Manually trigger a specific job (for testing/debugging)
  async triggerJob(jobName: string): Promise<void> {
    logger.info(`Manually triggering job: ${jobName}`);

    switch (jobName) {
      case 'workflow-jobs':
        await this.workflowJobsService.runPeriodicJobs();
        break;
      case 'reminders':
        await this.workflowJobsService.processReminders();
        break;
      case 'expirations':
        await this.workflowJobsService.processExpirations();
        break;
      case 'cleanup':
        await this.workflowJobsService.processStaleWorkflows();
        await this.workflowJobsService.cleanupExpiredJobs();
        break;
      case 'statistics':
        await this.logStatistics();
        break;
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }

    logger.info(`Completed manual job trigger: ${jobName}`);
  }

  // Check if cron service is healthy
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    if (!this.isRunning) {
      issues.push('Cron service is not running');
    }

    // Check if all expected jobs are running
    const expectedJobs = ['workflow-jobs', 'reminders', 'expirations', 'cleanup', 'statistics'];
    for (const jobName of expectedJobs) {
      const job = this.jobs.get(jobName);
      if (!job || job.getStatus() !== 'scheduled') {
        issues.push(`Job ${jobName} is not running`);
      }
    }

    // Check workflow system statistics for issues
    try {
      const stats = await this.workflowJobsService.getJobStatistics();
      
      if (stats.pendingReminders > 500) {
        issues.push(`Too many pending reminders: ${stats.pendingReminders}`);
      }
      
      if (stats.pendingExpirations > 100) {
        issues.push(`Too many pending expirations: ${stats.pendingExpirations}`);
      }
    } catch (error) {
      issues.push('Failed to retrieve workflow statistics');
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }
}