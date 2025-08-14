import { Router } from 'express';
import { pdfRoutes } from './pdfRoutes';
import { workflowRoutes } from './workflowRoutes';
import { attachmentRoutes } from './attachmentRoutes';
import { healthRoutes } from './healthRoutes';
import { authRoutes } from './authRoutes';

// Create main router
export const apiRoutes = Router();

// Health check routes (no authentication required)
apiRoutes.use('/health', healthRoutes);

// Authentication routes (no authentication required)
apiRoutes.use('/auth', authRoutes);

// API routes
apiRoutes.use('/pdf', pdfRoutes);
apiRoutes.use('/workflow', workflowRoutes);
apiRoutes.use('/attachments', attachmentRoutes);

// Default API info endpoint
apiRoutes.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'MVE Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      pdf: '/api/pdf',
      workflow: '/api/workflow',
      attachments: '/api/attachments',
    },
  });
});