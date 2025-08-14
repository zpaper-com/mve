import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { ApiError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError } from '../types';
import { config } from '../config/env';

export interface ErrorResponse {
  success: false;
  message: string;
  errors?: string[];
  timestamp: string;
  path: string;
  method: string;
  statusCode: number;
  requestId?: string;
  stack?: string;
}

// Global error handler middleware
export const errorHandler = (
  error: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const timestamp = new Date().toISOString();
  const path = req.originalUrl || req.url;
  const method = req.method;
  const requestId = req.headers['x-request-id'] as string;

  // Default error response
  let statusCode = 500;
  let message = 'Internal server error';
  let errors: string[] | undefined;

  // Handle known error types
  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    errors = error.errors;
  } else if (error instanceof ValidationError) {
    statusCode = 400;
    message = error.message;
    errors = error.errors;
  } else if (error instanceof NotFoundError) {
    statusCode = 404;
    message = error.message;
  } else if (error instanceof UnauthorizedError) {
    statusCode = 401;
    message = error.message;
  } else if (error instanceof ForbiddenError) {
    statusCode = 403;
    message = error.message;
  } else if (error.name === 'ValidationError') {
    // Zod validation errors
    statusCode = 400;
    message = 'Validation failed';
    if ('issues' in error) {
      errors = (error as any).issues.map((issue: any) => 
        `${issue.path.join('.')}: ${issue.message}`
      );
    }
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (error.name === 'MulterError') {
    statusCode = 400;
    message = `File upload error: ${error.message}`;
  }

  // Log the error
  logger.error('Request Error', {
    error: error.message,
    stack: error.stack,
    statusCode,
    path,
    method,
    requestId,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    ...(req as any).user && { userId: (req as any).user.sub },
    ...(req as any).session?.sessionId && { sessionId: (req as any).session.sessionId },
  });

  // Prepare error response
  const errorResponse: ErrorResponse = {
    success: false,
    message,
    ...(errors && { errors }),
    timestamp,
    path,
    method,
    statusCode,
    ...(requestId && { requestId }),
    ...(config.server.nodeEnv === 'development' && { stack: error.stack }),
  };

  // Send error response
  res.status(statusCode).json(errorResponse);
};

// 404 handler for unmatched routes
export const notFoundHandler = (req: Request, res: Response): void => {
  const timestamp = new Date().toISOString();
  const path = req.originalUrl || req.url;
  const method = req.method;

  logger.warn('Route not found', {
    path,
    method,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
  });

  const errorResponse: ErrorResponse = {
    success: false,
    message: `Cannot ${method} ${path}`,
    timestamp,
    path,
    method,
    statusCode: 404,
  };

  res.status(404).json(errorResponse);
};

// Async wrapper to catch async errors in route handlers
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Validation error handler for express-validator
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error: any) => 
      `${error.param}: ${error.msg}`
    );
    
    throw new ValidationError('Validation failed', errorMessages);
  }
  
  next();
};