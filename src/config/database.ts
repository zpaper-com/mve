import { PrismaClient } from '@prisma/client';
import { config } from './env';
import { createDatabaseLogger } from './logger';

const dbLogger = createDatabaseLogger();

// Create Prisma client with logging
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.database.url,
    },
  },
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'warn',
    },
    {
      emit: 'event',
      level: 'info',
    },
  ],
});

// Set up Prisma event listeners
prisma.$on('query', (e) => {
  if (config.server.nodeEnv === 'development' || config.server.logLevel === 'debug') {
    dbLogger.debug('Database Query', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
      timestamp: e.timestamp,
    });
  }
});

prisma.$on('error', (e) => {
  dbLogger.error('Database Error', {
    message: e.message,
    target: e.target,
    timestamp: e.timestamp,
  });
});

prisma.$on('warn', (e) => {
  dbLogger.warn('Database Warning', {
    message: e.message,
    target: e.target,
    timestamp: e.timestamp,
  });
});

prisma.$on('info', (e) => {
  dbLogger.info('Database Info', {
    message: e.message,
    target: e.target,
    timestamp: e.timestamp,
  });
});

// Connect to database
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    dbLogger.info('Database connection established');
    
    // Test the connection
    await prisma.$queryRaw`SELECT 1 as test`;
    dbLogger.info('Database connection test successful');
  } catch (error) {
    dbLogger.error('Failed to connect to database', { error: (error as Error).message });
    throw error;
  }
};

// Disconnect from database
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    dbLogger.info('Database connection closed');
  } catch (error) {
    dbLogger.error('Error closing database connection', { error: (error as Error).message });
    throw error;
  }
};

// Health check function
export const checkDatabaseHealth = async (): Promise<{ status: string; latency: number }> => {
  const startTime = Date.now();
  
  try {
    await prisma.$queryRaw`SELECT 1 as health_check`;
    const latency = Date.now() - startTime;
    
    return {
      status: 'healthy',
      latency,
    };
  } catch (error) {
    dbLogger.error('Database health check failed', { error: (error as Error).message });
    return {
      status: 'unhealthy',
      latency: Date.now() - startTime,
    };
  }
};

// Transaction wrapper
export const withTransaction = async <T>(
  operation: (tx: PrismaClient) => Promise<T>
): Promise<T> => {
  return await prisma.$transaction(async (tx) => {
    return await operation(tx as PrismaClient);
  });
};

export default prisma;