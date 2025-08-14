import express from 'express';
import { createServer } from 'http';
import session from 'express-session';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { logger, createRequestLogger } from './config/logger';
import { corsMiddleware } from './middleware/cors';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { applySecurity } from './middleware/security';
import { connectDatabase, disconnectDatabase } from './config/database';
import { createRedisClient, closeRedisConnection } from './config/redis';
import { WebSocketService } from './config/websocket';
import { CronService } from './services/cronService';
import { WorkflowService } from './services/workflowService';
import { EmailService } from './services/emailService';
import { RedisService } from './config/redis';
import { prisma } from './config/database';
import { apiRoutes } from './routes';

// Create Express application
const app = express();

// Create HTTP server
const server = createServer(app);

// Global variables
let webSocketService: WebSocketService;
let cronService: CronService;

// Graceful shutdown handler
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Close HTTP server
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Stop cron service
      if (cronService) {
        cronService.stop();
      }

      // Close WebSocket connections
      if (webSocketService) {
        await webSocketService.shutdown();
      }

      // Close database connection
      await disconnectDatabase();

      // Close Redis connection
      await closeRedisConnection();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', { error: (error as Error).message });
      process.exit(1);
    }
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Setup middleware
function setupMiddleware(): void {
  // Trust proxy (for load balancers) - must be first
  app.set('trust proxy', 1);

  // Security middleware (comprehensive security headers and protection)
  app.use(applySecurity);

  // Compression middleware
  app.use(compression());

  // CORS middleware
  app.use(corsMiddleware);

  // Cookie parsing middleware (required for auth)
  app.use(cookieParser());

  // Request logging middleware
  app.use(createRequestLogger());

  // Global rate limiting middleware
  app.use(rateLimiter);

  // Body parsing middleware
  app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
      // Store raw body for webhook signature verification
      (req as any).rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
}

// Setup session middleware
async function setupSession(): Promise<void> {
  try {
    const redisClient = await createRedisClient();
    const RedisStore = require('connect-redis').default;

    const sessionMiddleware = session({
      store: new RedisStore({ client: redisClient }),
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        secure: config.server.nodeEnv === 'production',
        httpOnly: true,
        maxAge: config.session.maxAge,
        sameSite: config.server.nodeEnv === 'production' ? 'strict' : 'lax',
      },
      name: 'mve.sid',
    });

    app.use(sessionMiddleware);
    logger.info('Session middleware configured with Redis store');
  } catch (error) {
    logger.error('Failed to setup session middleware', { error: (error as Error).message });
    throw error;
  }
}

// Setup routes
function setupRoutes(): void {
  // Health check endpoint (before API routes)
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
    });
  });

  // API routes
  app.use('/api', apiRoutes);

  // Serve static files in production
  if (config.server.nodeEnv === 'production') {
    app.use(express.static('public'));
    
    // Catch-all handler for SPA routing
    app.get('*', (req, res) => {
      res.sendFile('index.html', { root: 'public' });
    });
  }

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);
}

// Initialize application
async function initializeApp(): Promise<void> {
  try {
    logger.info('Initializing MVE Backend Application', {
      nodeEnv: config.server.nodeEnv,
      port: config.server.port,
      logLevel: config.server.logLevel,
    });

    // Connect to database
    await connectDatabase();

    // Setup middleware
    setupMiddleware();

    // Setup session middleware with Redis
    await setupSession();

    // Setup routes
    setupRoutes();

    // Initialize WebSocket service
    webSocketService = new WebSocketService(server);
    logger.info('WebSocket service initialized');

    // Initialize CronService for background jobs
    const redisService = new RedisService();
    const emailService = new EmailService();
    const workflowService = new WorkflowService(prisma, redisService, emailService);
    cronService = new CronService(prisma, redisService, emailService, workflowService);
    cronService.start();
    logger.info('Cron service initialized and started');

    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application', { error: (error as Error).message });
    throw error;
  }
}

// Start server
async function startServer(): Promise<void> {
  try {
    await initializeApp();

    server.listen(config.server.port, () => {
      logger.info('Server started successfully', {
        port: config.server.port,
        nodeEnv: config.server.nodeEnv,
        pid: process.pid,
        endpoints: {
          api: `http://localhost:${config.server.port}/api`,
          health: `http://localhost:${config.server.port}/health`,
          websocket: `ws://localhost:${config.server.port}`,
        },
      });
    });

    // Setup graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
      });
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: String(reason),
        promise: String(promise),
      });
      gracefulShutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error).message });
    process.exit(1);
  }
}

// Development utilities
if (config.server.nodeEnv === 'development') {
  // Log all routes in development
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      logger.debug('Registered route', {
        method: Object.keys(middleware.route.methods)[0].toUpperCase(),
        path: middleware.route.path,
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          logger.debug('Registered route', {
            method: Object.keys(handler.route.methods)[0].toUpperCase(),
            path: handler.route.path,
          });
        }
      });
    }
  });

  // Development login endpoint for testing
  app.post('/dev/login', (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { generateToken, createDevelopmentUser } = require('./middleware/auth');
    const user = createDevelopmentUser(userId);
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user,
    });
  });
}

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start application', { error: error.message });
  process.exit(1);
});

// Export for testing
export { app, server };