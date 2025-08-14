import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { securityConfig } from '../config/security';
import { config } from '../config/env';
import { logger } from '../config/logger';

// Security headers middleware using helmet
export const securityHeaders = helmet({
  // HTTP Strict Transport Security
  hsts: config.server.nodeEnv === 'production' ? {
    maxAge: securityConfig.headers.hsts.maxAge,
    includeSubDomains: securityConfig.headers.hsts.includeSubDomains,
    preload: securityConfig.headers.hsts.preload,
  } : false,

  // Content Security Policy
  contentSecurityPolicy: {
    directives: securityConfig.headers.csp.directives,
    reportOnly: securityConfig.headers.csp.reportOnly,
  },

  // X-Frame-Options
  frameguard: {
    action: 'deny',
  },

  // X-Content-Type-Options
  noSniff: true,

  // X-XSS-Protection
  xssFilter: true,

  // Referrer Policy
  referrerPolicy: {
    policy: securityConfig.headers.referrerPolicy as any,
  },

  // Remove X-Powered-By header
  hidePoweredBy: true,

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false,
  },

  // Expect-CT (Certificate Transparency)
  expectCt: config.server.nodeEnv === 'production' ? {
    maxAge: 86400, // 24 hours
    enforce: true,
  } : false,

  // Feature Policy / Permissions Policy
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    notifications: ['self'],
    payment: [],
    usb: [],
    magnetometer: [],
    accelerometer: [],
    gyroscope: [],
    speaker: [],
    vibrate: [],
    fullscreen: ['self'],
  },
});

// Custom security headers
export const customSecurityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Cross-Origin Resource Policy
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  // Cross-Origin Embedder Policy
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  // Cross-Origin Opener Policy
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  // Server identification removal
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  // Custom security headers
  res.setHeader('X-Content-Security-Policy', 'default-src \'self\'');
  res.setHeader('X-WebKit-CSP', 'default-src \'self\'');

  // Prevent MIME type sniffing
  res.setHeader('X-Download-Options', 'noopen');

  // Prevent Adobe Flash and PDF files from including your site
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Prevent browsers from MIME-sniffing away from the declared Content-Type
  res.setHeader('X-Content-Type-Options', 'nosniff');

  next();
};

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  const sanitizeString = (str: string): string => {
    if (typeof str !== 'string') return str;
    
    return str
      .replace(/[<>]/g, '') // Remove basic HTML characters
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/script/gi, 'scr1pt') // Neutralize script tags
      .trim();
  };

  const sanitizeObject = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[sanitizeString(key)] = sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  };

  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// Content validation middleware
export const validateContentType = (allowedTypes: string[] = ['application/json']) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip validation for GET requests and requests without body
    if (req.method === 'GET' || !req.body || Object.keys(req.body).length === 0) {
      return next();
    }

    const contentType = req.get('Content-Type');
    
    if (!contentType) {
      return res.status(400).json({
        success: false,
        message: 'Content-Type header is required',
        timestamp: new Date().toISOString(),
      });
    }

    const isAllowed = allowedTypes.some(type => contentType.includes(type));
    
    if (!isAllowed) {
      logger.warn('Invalid content type', {
        contentType,
        allowedTypes,
        path: req.path,
        ip: req.ip,
      });

      return res.status(415).json({
        success: false,
        message: `Unsupported Media Type. Allowed types: ${allowedTypes.join(', ')}`,
        timestamp: new Date().toISOString(),
      });
    }

    next();
  };
};

// Request size limit middleware
export const requestSizeLimit = (maxSize: number = 10 * 1024 * 1024) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      logger.warn('Request too large', {
        size: contentLength,
        maxSize,
        path: req.path,
        ip: req.ip,
      });

      return res.status(413).json({
        success: false,
        message: `Request entity too large. Maximum size: ${Math.round(maxSize / 1024 / 1024)}MB`,
        timestamp: new Date().toISOString(),
      });
    }

    next();
  };
};

// IP whitelist/blacklist middleware
export const ipFilter = (options: {
  whitelist?: string[];
  blacklist?: string[];
} = {}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Check blacklist first
    if (options.blacklist && options.blacklist.includes(clientIp)) {
      logger.warn('Blocked IP attempt', {
        ip: clientIp,
        path: req.path,
        userAgent: req.get('User-Agent'),
      });

      return res.status(403).json({
        success: false,
        message: 'Access denied',
        timestamp: new Date().toISOString(),
      });
    }

    // Check whitelist if provided
    if (options.whitelist && options.whitelist.length > 0) {
      if (!options.whitelist.includes(clientIp)) {
        logger.warn('IP not whitelisted', {
          ip: clientIp,
          path: req.path,
          userAgent: req.get('User-Agent'),
        });

        return res.status(403).json({
          success: false,
          message: 'Access denied',
          timestamp: new Date().toISOString(),
        });
      }
    }

    next();
  };
};

// Suspicious activity detection middleware
export const detectSuspiciousActivity = (req: Request, res: Response, next: NextFunction): void => {
  const suspiciousPatterns = [
    // SQL injection patterns
    /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bDELETE\b|\bUPDATE\b|\bDROP\b)/i,
    // XSS patterns
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    // Path traversal patterns
    /\.\.[\/\\]/,
    // Command injection patterns
    /[;&|`$]/,
    // LDAP injection patterns
    /[()=*!&|]/,
  ];

  const checkSuspicious = (value: string): boolean => {
    return suspiciousPatterns.some(pattern => pattern.test(value));
  };

  const checkValue = (obj: any): boolean => {
    if (typeof obj === 'string') {
      return checkSuspicious(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.some(checkValue);
    }
    
    if (obj && typeof obj === 'object') {
      return Object.values(obj).some(checkValue);
    }
    
    return false;
  };

  // Check URL, query, and body for suspicious patterns
  const url = req.originalUrl;
  const isSuspicious = 
    checkSuspicious(url) ||
    checkValue(req.query) ||
    checkValue(req.body);

  if (isSuspicious) {
    logger.warn('Suspicious activity detected', {
      ip: req.ip,
      url,
      userAgent: req.get('User-Agent'),
      query: req.query,
      body: req.body,
    });

    return res.status(400).json({
      success: false,
      message: 'Invalid request detected',
      timestamp: new Date().toISOString(),
    });
  }

  next();
};

// Security audit middleware
export const securityAudit = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Log security-relevant request information
  const auditData = {
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
    timestamp: new Date().toISOString(),
    headers: {
      authorization: !!req.get('Authorization'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
    },
  };

  // Override res.json to capture response data
  const originalJson = res.json;
  res.json = function(data: any) {
    const responseTime = Date.now() - startTime;
    
    // Log completed request
    logger.info('Security audit', {
      ...auditData,
      statusCode: res.statusCode,
      responseTime,
      success: data?.success !== false,
    });

    return originalJson.call(this, data);
  };

  next();
};

// Combined security middleware
export const applySecurity = [
  securityHeaders,
  customSecurityHeaders,
  sanitizeInput,
  validateContentType(['application/json', 'multipart/form-data']),
  requestSizeLimit(25 * 1024 * 1024), // 25MB limit
  detectSuspiciousActivity,
  securityAudit,
];