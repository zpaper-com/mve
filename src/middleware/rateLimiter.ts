import rateLimit from 'express-rate-limit';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from '../types';

// Create rate limiter
export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    logger.warn('Rate limit exceeded', {
      ip: clientIP,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
      method: req.method,
    });

    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      timestamp: new Date().toISOString(),
    });
  },
  skip: (req) => {
    // Skip rate limiting for health checks and static assets
    const skipPaths = ['/health', '/favicon.ico', '/robots.txt'];
    return skipPaths.some(path => req.path.startsWith(path));
  },
  keyGenerator: (req) => {
    // Use X-Forwarded-For header if behind a proxy, otherwise use connection IP
    return req.ip || req.connection.remoteAddress || 'anonymous';
  },
});

// Create stricter rate limiter for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    logger.warn('Auth rate limit exceeded', {
      ip: clientIP,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
      method: req.method,
    });

    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.',
      timestamp: new Date().toISOString(),
    });
  },
});

// Create file upload rate limiter
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 uploads per minute
  message: {
    success: false,
    message: 'Too many file uploads, please try again later.',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    logger.warn('Upload rate limit exceeded', {
      ip: clientIP,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
      method: req.method,
    });

    res.status(429).json({
      success: false,
      message: 'Too many file uploads, please try again later.',
      timestamp: new Date().toISOString(),
    });
  },
});