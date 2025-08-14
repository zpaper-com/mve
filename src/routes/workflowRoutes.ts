import { Router } from 'express';
import { 
  WorkflowController,
  validateCreateWorkflow,
  validateSubmitWorkflow,
  validateUniqueUrl,
  validateSessionId
} from '../controllers/workflowController';
import { WorkflowService } from '../services/workflowService';
import { EmailService } from '../services/emailService';
import { authenticate, optionalAuth, requireAdmin } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/errorHandler';
import { prisma } from '../config/database';
import { RedisService } from '../config/redis';

// Create service instances
const redisService = new RedisService();
const emailService = new EmailService();
const workflowService = new WorkflowService(prisma, redisService, emailService);
const workflowController = new WorkflowController(workflowService);

// Create router
export const workflowRoutes = Router();

// POST /api/workflow/create - Create new workflow (authenticated)
workflowRoutes.post(
  '/create',
  authenticate,
  validateCreateWorkflow,
  handleValidationErrors,
  workflowController.createWorkflow
);

// GET /api/workflow/:uniqueUrl - Get workflow by unique URL (public)
workflowRoutes.get(
  '/:uniqueUrl',
  validateUniqueUrl,
  handleValidationErrors,
  optionalAuth,
  workflowController.getWorkflowByUrl
);

// POST /api/workflow/:uniqueUrl/submit - Submit workflow step (public)
workflowRoutes.post(
  '/:uniqueUrl/submit',
  validateSubmitWorkflow,
  handleValidationErrors,
  optionalAuth,
  workflowController.submitWorkflow
);

// GET /api/workflow/session/:sessionId/status - Get workflow status (admin only)
workflowRoutes.get(
  '/session/:sessionId/status',
  authenticate,
  requireAdmin,
  validateSessionId,
  handleValidationErrors,
  workflowController.getWorkflowStatus
);

// PUT /api/workflow/session/:sessionId/expire - Expire workflow (admin only)
workflowRoutes.put(
  '/session/:sessionId/expire',
  authenticate,
  requireAdmin,
  validateSessionId,
  handleValidationErrors,
  workflowController.expireWorkflow
);

// GET /api/workflow/session/:sessionId/stats - Get workflow statistics (authenticated)
workflowRoutes.get(
  '/session/:sessionId/stats',
  authenticate,
  validateSessionId,
  handleValidationErrors,
  workflowController.getWorkflowStats
);

// GET /api/workflow/list - List workflows (admin only)
workflowRoutes.get(
  '/list',
  authenticate,
  requireAdmin,
  workflowController.listWorkflows
);

// POST /api/workflow/session/:sessionId/cancel - Cancel workflow (admin only)
workflowRoutes.post(
  '/session/:sessionId/cancel',
  authenticate,
  requireAdmin,
  validateSessionId,
  handleValidationErrors,
  workflowController.cancelWorkflow
);