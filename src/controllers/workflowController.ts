import { Response } from 'express';
import { WorkflowService } from '../services/workflowService';
import { logger } from '../config/logger';
import { createApiResponse, createErrorResponse } from '../utils';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest, CreateWorkflowRequest, SubmitWorkflowRequest, RecipientType } from '../types';
import { body, param, validationResult } from 'express-validator';

export class WorkflowController {
  constructor(private workflowService: WorkflowService) {}

  // POST /api/workflow/create - Create new workflow session
  createWorkflow = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createErrorResponse(
        'Validation failed',
        errors.array().map(err => `${err.param}: ${err.msg}`)
      ));
    }

    const createRequest: CreateWorkflowRequest = req.body;

    logger.info('Creating new workflow', {
      recipientCount: createRequest.recipients.length,
      userId: req.user?.sub,
    });

    try {
      const workflow = await this.workflowService.createWorkflow(createRequest);

      res.status(201).json(createApiResponse(
        workflow,
        'Workflow created successfully'
      ));
    } catch (error) {
      logger.error('Error creating workflow', {
        error: (error as Error).message,
        userId: req.user?.sub,
        recipientCount: createRequest.recipients.length,
      });
      res.status(500).json(createErrorResponse('Failed to create workflow'));
    }
  });

  // GET /api/workflow/:uniqueUrl - Get workflow by unique URL
  getWorkflowByUrl = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { uniqueUrl } = req.params;

    logger.info('Getting workflow by URL', {
      uniqueUrl,
      ip: req.ip,
    });

    try {
      const workflowStatus = await this.workflowService.getWorkflowByUrl(uniqueUrl);

      // Store recipient ID in session for future requests
      if (req.session) {
        req.session.recipientId = workflowStatus.currentRecipient?.id;
        req.session.sessionId = workflowStatus.session.id;
      }

      res.json(createApiResponse(
        workflowStatus,
        'Workflow retrieved successfully'
      ));
    } catch (error) {
      logger.error('Error getting workflow by URL', {
        uniqueUrl,
        error: (error as Error).message,
        ip: req.ip,
      });

      // Return appropriate error status
      if (error.name === 'NotFoundError') {
        res.status(404).json(createErrorResponse(error.message));
      } else if (error.statusCode === 410) {
        res.status(410).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse('Failed to retrieve workflow'));
      }
    }
  });

  // POST /api/workflow/:uniqueUrl/submit - Submit workflow step
  submitWorkflow = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(createErrorResponse(
        'Validation failed',
        errors.array().map(err => `${err.param}: ${err.msg}`)
      ));
    }

    const { uniqueUrl } = req.params;
    const { formData }: SubmitWorkflowRequest = req.body;

    logger.info('Submitting workflow step', {
      uniqueUrl,
      fieldCount: Object.keys(formData || {}).length,
      userId: req.user?.sub || 'anonymous',
    });

    try {
      const workflowStatus = await this.workflowService.submitWorkflow(uniqueUrl, formData);

      res.json(createApiResponse(
        workflowStatus,
        'Workflow step submitted successfully'
      ));
    } catch (error) {
      logger.error('Error submitting workflow step', {
        uniqueUrl,
        error: (error as Error).message,
        userId: req.user?.sub || 'anonymous',
      });

      // Return appropriate error status
      if (error.name === 'NotFoundError') {
        res.status(404).json(createErrorResponse(error.message));
      } else if (error.name === 'ValidationError') {
        res.status(400).json(createErrorResponse(error.message));
      } else {
        res.status(500).json(createErrorResponse('Failed to submit workflow step'));
      }
    }
  });

  // GET /api/workflow/:sessionId/status - Get workflow status (admin only)
  getWorkflowStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { sessionId } = req.params;

    logger.info('Getting workflow status', {
      sessionId,
      userId: req.user?.sub,
    });

    try {
      const workflow = await this.workflowService.getWorkflowById(sessionId);

      if (!workflow) {
        return res.status(404).json(createErrorResponse('Workflow not found'));
      }

      const stats = await this.workflowService.getWorkflowStats(sessionId);

      res.json(createApiResponse(
        {
          workflow,
          stats,
        },
        'Workflow status retrieved successfully'
      ));
    } catch (error) {
      logger.error('Error getting workflow status', {
        sessionId,
        error: (error as Error).message,
        userId: req.user?.sub,
      });
      res.status(500).json(createErrorResponse('Failed to get workflow status'));
    }
  });

  // PUT /api/workflow/:sessionId/expire - Expire workflow (admin only)
  expireWorkflow = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { sessionId } = req.params;

    logger.info('Expiring workflow', {
      sessionId,
      userId: req.user?.sub,
    });

    try {
      await this.workflowService.expireWorkflow(sessionId);

      res.json(createApiResponse(
        { sessionId },
        'Workflow expired successfully'
      ));
    } catch (error) {
      logger.error('Error expiring workflow', {
        sessionId,
        error: (error as Error).message,
        userId: req.user?.sub,
      });
      res.status(500).json(createErrorResponse('Failed to expire workflow'));
    }
  });

  // GET /api/workflow/:sessionId/stats - Get workflow statistics
  getWorkflowStats = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { sessionId } = req.params;

    logger.debug('Getting workflow statistics', {
      sessionId,
      userId: req.user?.sub,
    });

    try {
      const stats = await this.workflowService.getWorkflowStats(sessionId);

      res.json(createApiResponse(
        stats,
        'Workflow statistics retrieved successfully'
      ));
    } catch (error) {
      logger.error('Error getting workflow statistics', {
        sessionId,
        error: (error as Error).message,
        userId: req.user?.sub,
      });
      res.status(500).json(createErrorResponse('Failed to get workflow statistics'));
    }
  });

  // GET /api/workflow/list - List workflows (admin only)
  listWorkflows = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const status = req.query.status as string;
    const skip = (page - 1) * limit;

    logger.info('Listing workflows', {
      page,
      limit,
      status,
      userId: req.user?.sub,
    });

    try {
      const whereClause: any = {};
      if (status) {
        whereClause.status = status;
      }

      const [workflows, total] = await Promise.all([
        this.workflowService['prisma'].workflowSession.findMany({
          where: whereClause,
          include: {
            recipients: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                orderIndex: true,
                recipientType: true,
                partyName: true,
                email: true,
                status: true,
                accessedAt: true,
                completedAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.workflowService['prisma'].workflowSession.count({ where: whereClause }),
      ]);

      const mappedWorkflows = workflows.map(w => this.workflowService.mapDatabaseToWorkflowSession(w));

      res.json(createApiResponse({
        workflows: mappedWorkflows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }, 'Workflows retrieved successfully'));
    } catch (error) {
      logger.error('Error listing workflows', {
        error: (error as Error).message,
        userId: req.user?.sub,
      });
      res.status(500).json(createErrorResponse('Failed to list workflows'));
    }
  });

  // POST /api/workflow/:sessionId/cancel - Cancel workflow (admin only)
  cancelWorkflow = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    const { sessionId } = req.params;
    const { reason } = req.body;

    logger.info('Cancelling workflow', {
      sessionId,
      reason,
      userId: req.user?.sub,
    });

    try {
      await this.workflowService['prisma'].workflowSession.update({
        where: { id: sessionId },
        data: { 
          status: 'CANCELLED',
          metadata: {
            cancelledBy: req.user?.sub,
            cancelledAt: new Date().toISOString(),
            reason: reason || 'No reason provided',
          },
        },
      });

      // Update all pending recipients to cancelled
      await this.workflowService['prisma'].recipient.updateMany({
        where: { 
          sessionId,
          status: { in: ['PENDING', 'NOTIFIED', 'ACCESSED', 'IN_PROGRESS'] }
        },
        data: { status: 'EXPIRED' },
      });

      res.json(createApiResponse(
        { sessionId },
        'Workflow cancelled successfully'
      ));
    } catch (error) {
      logger.error('Error cancelling workflow', {
        sessionId,
        error: (error as Error).message,
        userId: req.user?.sub,
      });
      res.status(500).json(createErrorResponse('Failed to cancel workflow'));
    }
  });
}

// Validation middleware for creating workflow
export const validateCreateWorkflow = [
  body('recipients')
    .isArray({ min: 1, max: 10 })
    .withMessage('Recipients must be an array with 1-10 items'),
  body('recipients.*.recipientType')
    .isIn(Object.values(RecipientType))
    .withMessage('Invalid recipient type'),
  body('recipients.*.partyName')
    .optional()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage('Party name must be 1-255 characters'),
  body('recipients.*.email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  body('recipients.*.mobile')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Invalid mobile number'),
  body('recipients.*.npi')
    .optional()
    .matches(/^\d{10}$/)
    .withMessage('NPI must be 10 digits'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
  // Custom validation to ensure each recipient has email or mobile
  body('recipients').custom((recipients) => {
    for (const recipient of recipients) {
      if (!recipient.email && !recipient.mobile) {
        throw new Error('Each recipient must have either email or mobile');
      }
    }
    return true;
  }),
];

// Validation middleware for submitting workflow
export const validateSubmitWorkflow = [
  param('uniqueUrl')
    .isString()
    .isLength({ min: 10 })
    .withMessage('Invalid unique URL'),
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

// Validation middleware for unique URL
export const validateUniqueUrl = [
  param('uniqueUrl')
    .isString()
    .isLength({ min: 10 })
    .withMessage('Invalid unique URL'),
];

// Validation middleware for session ID
export const validateSessionId = [
  param('sessionId')
    .isUUID()
    .withMessage('Session ID must be a valid UUID'),
];