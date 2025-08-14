import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from './env';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(stack && { stack }),
      ...(Object.keys(metadata).length && { metadata }),
    };
    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `[${timestamp}] ${level}: ${message}${stack ? `\n${stack}` : ''}`;
  })
);

// Create transports array
const transports: winston.transport[] = [];

// Console transport
if (config.server.nodeEnv !== 'production') {
  transports.push(
    new winston.transports.Console({
      level: config.server.logLevel,
      format: consoleFormat,
    })
  );
} else {
  transports.push(
    new winston.transports.Console({
      level: config.server.logLevel,
      format: logFormat,
    })
  );
}

// File transports for production
if (config.server.nodeEnv === 'production') {
  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      format: logFormat,
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    })
  );

  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      format: logFormat,
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: config.server.logLevel,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Create request logger middleware
export const createRequestLogger = () => {
  return (req: any, res: any, next: any): void => {
    const startTime = Date.now();
    const originalSend = res.send;

    // Override res.send to capture response
    res.send = function(body: any) {
      const duration = Date.now() - startTime;
      
      logger.info('HTTP Request', {
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        ...(req.user && { userId: req.user.sub }),
        ...(req.session?.sessionId && { sessionId: req.session.sessionId }),
        ...(res.statusCode >= 400 && { responseBody: body }),
      });

      return originalSend.call(this, body);
    };

    next();
  };
};

// Utility logging functions
export const logError = (error: Error, context?: Record<string, any>): void => {
  logger.error('Application Error', {
    error: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
  });
};

export const logWarning = (message: string, context?: Record<string, any>): void => {
  logger.warn(message, context);
};

export const logInfo = (message: string, context?: Record<string, any>): void => {
  logger.info(message, context);
};

export const logDebug = (message: string, context?: Record<string, any>): void => {
  logger.debug(message, context);
};

// Database logger for Prisma
export const createDatabaseLogger = () => {
  return {
    info: (message: string, context?: any) => logger.info(`[DATABASE] ${message}`, context),
    warn: (message: string, context?: any) => logger.warn(`[DATABASE] ${message}`, context),
    error: (message: string, context?: any) => logger.error(`[DATABASE] ${message}`, context),
    debug: (message: string, context?: any) => logger.debug(`[DATABASE] ${message}`, context),
  };
};

export default logger;