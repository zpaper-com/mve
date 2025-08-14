import { createClient, RedisClientType } from 'redis';
import { config } from './env';
import { logger } from './logger';

let redisClient: RedisClientType;

// Create Redis client
export const createRedisClient = async (): Promise<RedisClientType> => {
  try {
    redisClient = createClient({
      url: config.redis.url,
      password: config.redis.password,
      socket: {
        connectTimeout: 60000,
        reconnectStrategy: (retries) => {
          if (retries >= 5) {
            logger.error('Redis max reconnection attempts reached');
            return false;
          }
          const delay = Math.min(retries * 1000, 3000);
          logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries + 1})`);
          return delay;
        },
      },
    });

    // Redis event handlers
    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (error) => {
      logger.error('Redis client error', { error: error.message });
    });

    redisClient.on('end', () => {
      logger.warn('Redis client connection ended');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });

    // Connect to Redis
    await redisClient.connect();

    // Test connection
    await redisClient.ping();
    logger.info('Redis connection established successfully');

    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis', { error: (error as Error).message });
    throw error;
  }
};

// Get Redis client instance
export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call createRedisClient() first.');
  }
  return redisClient;
};

// Close Redis connection
export const closeRedisConnection = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
};

// Redis utility functions
export class RedisService {
  private client: RedisClientType;

  constructor() {
    this.client = getRedisClient();
  }

  // Session management
  async setSession(sessionId: string, data: any, ttl: number = 86400): Promise<void> {
    try {
      await this.client.setEx(`session:${sessionId}`, ttl, JSON.stringify(data));
      logger.debug('Session stored', { sessionId, ttl });
    } catch (error) {
      logger.error('Error setting session', { error: (error as Error).message, sessionId });
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<any | null> {
    try {
      const data = await this.client.get(`session:${sessionId}`);
      if (!data) return null;
      
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error getting session', { error: (error as Error).message, sessionId });
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.client.del(`session:${sessionId}`);
      logger.debug('Session deleted', { sessionId });
    } catch (error) {
      logger.error('Error deleting session', { error: (error as Error).message, sessionId });
      throw error;
    }
  }

  // Workflow state caching
  async setWorkflowState(sessionId: string, state: any, ttl: number = 3600): Promise<void> {
    try {
      await this.client.setEx(`workflow:${sessionId}`, ttl, JSON.stringify(state));
      logger.debug('Workflow state cached', { sessionId, ttl });
    } catch (error) {
      logger.error('Error caching workflow state', { error: (error as Error).message, sessionId });
      throw error;
    }
  }

  async getWorkflowState(sessionId: string): Promise<any | null> {
    try {
      const data = await this.client.get(`workflow:${sessionId}`);
      if (!data) return null;
      
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error getting workflow state', { error: (error as Error).message, sessionId });
      return null;
    }
  }

  async deleteWorkflowState(sessionId: string): Promise<void> {
    try {
      await this.client.del(`workflow:${sessionId}`);
      logger.debug('Workflow state deleted', { sessionId });
    } catch (error) {
      logger.error('Error deleting workflow state', { error: (error as Error).message, sessionId });
      throw error;
    }
  }

  // Rate limiting support
  async incrementRateLimit(key: string, ttl: number): Promise<number> {
    try {
      const result = await this.client.multi()
        .incr(key)
        .expire(key, ttl)
        .exec();
      
      return result?.[0] as number || 0;
    } catch (error) {
      logger.error('Error incrementing rate limit', { error: (error as Error).message, key });
      throw error;
    }
  }

  async getRateLimit(key: string): Promise<number> {
    try {
      const count = await this.client.get(key);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      logger.error('Error getting rate limit', { error: (error as Error).message, key });
      return 0;
    }
  }

  // Notification queues
  async pushNotification(queue: string, notification: any): Promise<void> {
    try {
      await this.client.lPush(`queue:${queue}`, JSON.stringify(notification));
      logger.debug('Notification queued', { queue, notification });
    } catch (error) {
      logger.error('Error pushing notification', { error: (error as Error).message, queue });
      throw error;
    }
  }

  async popNotification(queue: string, timeout: number = 10): Promise<any | null> {
    try {
      const result = await this.client.brPop(`queue:${queue}`, timeout);
      if (!result) return null;
      
      return JSON.parse(result.element || result);
    } catch (error) {
      logger.error('Error popping notification', { error: (error as Error).message, queue });
      return null;
    }
  }

  // Generic cache operations
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (ttl) {
        await this.client.setEx(key, ttl, stringValue);
      } else {
        await this.client.set(key, stringValue);
      }
    } catch (error) {
      logger.error('Error setting cache value', { error: (error as Error).message, key });
      throw error;
    }
  }

  async get(key: string): Promise<any | null> {
    try {
      const data = await this.client.get(key);
      if (!data) return null;
      
      try {
        return JSON.parse(data);
      } catch {
        return data; // Return as string if not JSON
      }
    } catch (error) {
      logger.error('Error getting cache value', { error: (error as Error).message, key });
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Error deleting cache value', { error: (error as Error).message, key });
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Error checking cache existence', { error: (error as Error).message, key });
      return false;
    }
  }
}