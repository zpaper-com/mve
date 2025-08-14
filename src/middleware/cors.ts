import cors from 'cors';
import { config } from '../config/env';
import { logger } from '../config/logger';

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = config.cors.origins;
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      logger.debug('CORS: Origin allowed', { origin });
      callback(null, true);
    } else {
      logger.warn('CORS: Origin blocked', { origin, allowedOrigins });
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
});