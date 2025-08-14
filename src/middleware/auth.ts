import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import crypto from 'crypto';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { getRedisClient } from '../config/redis';
import { 
  getAuth0Config, 
  auth0Service, 
  UserRole, 
  UserProfile,
  sessionConfig,
  csrfConfig,
  permissions 
} from '../config/auth';
import { UnauthorizedError, AuthenticatedRequest } from '../types';

// Get Auth0 configuration
const auth0Config = getAuth0Config();

// JWKS client for Auth0
const client = auth0Config.domain && config.auth0.domain ? jwksClient({
  jwksUri: `https://${auth0Config.domain}/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
  jwksUri_timeout: 30000,
  jwksUri_cache: 600000,
  requestHeaders: {
    'User-Agent': 'mve-backend/1.0.0'
  },
  timeout: 30000,
  proxy: false,
}) : null;

// Get signing key from Auth0
const getKey = (header: any, callback: any): void => {
  if (!client) {
    return callback(new Error('Auth0 not configured'));
  }
  
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      logger.error('Error getting signing key', { error: err.message });
      return callback(err);
    }
    
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
};

// Session management
export interface SessionData {
  userId: string;
  email: string;
  roles: UserRole[];
  sessionId: string;
  csrfToken: string;
  createdAt: number;
  lastActivity: number;
  ipAddress?: string;
  userAgent?: string;
}

// Generate CSRF token
export const generateCSRFToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// Create session in Redis
export const createSession = async (
  userId: string, 
  userProfile: UserProfile,
  req: Request
): Promise<{ sessionId: string; csrfToken: string }> => {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const csrfToken = generateCSRFToken();
  
  const sessionData: SessionData = {
    userId,
    email: userProfile.email,
    roles: userProfile.roles,
    sessionId,
    csrfToken,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  };

  try {
    const redisClient = getRedisClient();
    await redisClient.setEx(
      `session:${sessionId}`, 
      Math.floor(sessionConfig.maxAge / 1000), 
      JSON.stringify(sessionData)
    );

    // Track active sessions per user (max 5 concurrent sessions)
    const userSessionsKey = `user_sessions:${userId}`;
    await redisClient.sAdd(userSessionsKey, sessionId);
    await redisClient.expire(userSessionsKey, Math.floor(sessionConfig.maxAge / 1000));
    
    // Clean up old sessions if user has too many
    const sessionCount = await redisClient.sCard(userSessionsKey);
    if (sessionCount > 5) {
      const oldSessions = await redisClient.sPop(userSessionsKey, sessionCount - 5);
      if (oldSessions) {
        const sessionsToDelete = Array.isArray(oldSessions) ? oldSessions : [oldSessions];
        for (const oldSessionId of sessionsToDelete) {
          await redisClient.del(`session:${oldSessionId}`);
        }
      }
    }

    logger.info('Session created', { 
      userId, 
      sessionId, 
      userAgent: sessionData.userAgent?.substring(0, 100) 
    });
    
    return { sessionId, csrfToken };
  } catch (error: any) {
    logger.error('Failed to create session', { error: error.message, userId });
    throw new Error('Session creation failed');
  }
};

// Get session from Redis
export const getSession = async (sessionId: string): Promise<SessionData | null> => {
  try {
    const redisClient = getRedisClient();
    const sessionData = await redisClient.get(`session:${sessionId}`);
    if (!sessionData) return null;
    
    return JSON.parse(sessionData) as SessionData;
  } catch (error: any) {
    logger.error('Failed to get session', { error: error.message, sessionId });
    return null;
  }
};

// Update session activity
export const updateSessionActivity = async (sessionId: string): Promise<boolean> => {
  try {
    const sessionData = await getSession(sessionId);
    if (!sessionData) return false;
    
    sessionData.lastActivity = Date.now();
    
    const redisClient = getRedisClient();
    await redisClient.setEx(
      `session:${sessionId}`, 
      Math.floor(sessionConfig.maxAge / 1000), 
      JSON.stringify(sessionData)
    );
    
    return true;
  } catch (error: any) {
    logger.error('Failed to update session', { error: error.message, sessionId });
    return false;
  }
};

// Destroy session
export const destroySession = async (sessionId: string): Promise<boolean> => {
  try {
    const sessionData = await getSession(sessionId);
    if (!sessionData) return true; // Already destroyed
    
    const redisClient = getRedisClient();
    await redisClient.del(`session:${sessionId}`);
    await redisClient.sRem(`user_sessions:${sessionData.userId}`, sessionId);
    
    logger.info('Session destroyed', { sessionId, userId: sessionData.userId });
    return true;
  } catch (error: any) {
    logger.error('Failed to destroy session', { error: error.message, sessionId });
    return false;
  }
};

// Verify JWT token
export const verifyToken = async (token: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    // For development without Auth0, use simple JWT verification
    if (config.server.nodeEnv === 'development' && !config.auth0.domain) {
      try {
        const decoded = jwt.verify(token, config.jwt.secret, {
          algorithms: ['HS256'],
          issuer: 'mve-backend',
          audience: 'mve-frontend',
        });
        return resolve(decoded);
      } catch (error) {
        return reject(error);
      }
    }

    // For production with Auth0, use RS256 verification
    if (!auth0Config.domain) {
      return reject(new Error('Auth0 domain not configured'));
    }

    jwt.verify(token, getKey, {
      audience: auth0Config.audience,
      issuer: auth0Config.issuer,
      algorithms: auth0Config.algorithms,
      clockTolerance: auth0Config.clockTolerance,
      ignoreExpiration: false,
      ignoreNotBefore: false,
    }, (err, decoded) => {
      if (err) {
        logger.error('JWT verification failed', { 
          error: err.message, 
          tokenLength: token.length 
        });
        return reject(err);
      }
      resolve(decoded);
    });
  });
};

// JWT authentication middleware with session support
export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    let user: any = null;
    let sessionData: SessionData | null = null;

    // Try session-based auth first (for web clients)
    const sessionId = req.cookies?.[sessionConfig.name];
    if (sessionId) {
      sessionData = await getSession(sessionId);
      if (sessionData) {
        // Check if session is expired based on activity
        const maxInactivity = 30 * 60 * 1000; // 30 minutes
        if (Date.now() - sessionData.lastActivity > maxInactivity) {
          await destroySession(sessionId);
          res.clearCookie(sessionConfig.name);
          throw new UnauthorizedError('Session expired due to inactivity');
        }

        // Get fresh user data from Auth0
        const userProfile = await auth0Service.getUser(sessionData.userId);
        if (!userProfile) {
          await destroySession(sessionId);
          res.clearCookie(sessionConfig.name);
          throw new UnauthorizedError('User not found');
        }

        user = {
          sub: userProfile.sub,
          email: userProfile.email,
          name: userProfile.name,
          picture: userProfile.picture,
          roles: userProfile.roles,
          permissions: userProfile.app_metadata?.permissions || [],
          sessionId,
          csrfToken: sessionData.csrfToken,
        };

        // Update session activity
        await updateSessionActivity(sessionId);
      }
    }

    // Fallback to Bearer token auth (for API clients)
    if (!user) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('No valid authentication provided');
      }

      const token = authHeader.substring(7);
      const decoded = await verifyToken(token);
      
      // For Auth0 tokens, get additional user data
      if (decoded.sub && config.auth0.domain) {
        const userProfile = await auth0Service.getUser(decoded.sub);
        if (userProfile) {
          user = {
            ...decoded,
            roles: userProfile.roles,
            permissions: userProfile.app_metadata?.permissions || [],
          };
        } else {
          user = {
            ...decoded,
            roles: [UserRole.PATIENT], // Default role
            permissions: [],
          };
        }
      } else {
        // Development token
        user = {
          ...decoded,
          roles: decoded.roles || [UserRole.PATIENT],
          permissions: decoded.permissions || [],
        };
      }
    }
    
    req.user = user;
    req.session = sessionData;
    
    logger.debug('User authenticated', {
      userId: user.sub,
      email: user.email,
      roles: user.roles,
      authMethod: sessionData ? 'session' : 'bearer',
      path: req.path,
    });
    
    next();
  } catch (error: any) {
    logger.warn('Authentication failed', {
      error: error.message,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent')?.substring(0, 100),
    });
    
    next(new UnauthorizedError(error.message || 'Authentication failed'));
  }
};

// Optional authentication middleware (doesn't fail if no token)
export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = await verifyToken(token);
    
    req.user = decoded;
    
    logger.debug('User optionally authenticated', {
      userId: decoded.sub,
      path: req.path,
    });
    
    next();
  } catch (error) {
    // Don't fail on optional auth errors, just log them
    logger.debug('Optional authentication failed', {
      error: (error as Error).message,
      path: req.path,
    });
    next();
  }
};

// Generate JWT token for development/testing
export const generateToken = (payload: any): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: '24h',
    issuer: 'mve-backend',
    audience: 'mve-frontend',
  });
};

// Development login endpoint helper
export const createDevelopmentUser = (userId: string, email?: string): any => {
  return {
    sub: userId,
    email: email || `user-${userId}@example.com`,
    name: `User ${userId}`,
    picture: `https://via.placeholder.com/150?text=${userId}`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    aud: 'mve-frontend',
    iss: 'mve-backend',
  };
};

// CSRF protection middleware
export const csrfProtection = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  // Skip CSRF for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for Bearer token auth (API clients)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }

  // Check session and CSRF token for session-based auth
  const sessionId = req.cookies?.[sessionConfig.name];
  if (!sessionId || !req.session) {
    return next(new UnauthorizedError('CSRF protection: No valid session'));
  }

  const csrfToken = req.headers['x-csrf-token'] as string;
  if (!csrfToken || csrfToken !== req.session.csrfToken) {
    logger.warn('CSRF token mismatch', {
      userId: req.user?.sub,
      sessionId,
      path: req.path,
      providedToken: csrfToken?.substring(0, 8),
      expectedToken: req.session.csrfToken?.substring(0, 8),
    });
    
    return next(new UnauthorizedError('CSRF protection: Invalid token'));
  }

  next();
};

// Permission-based authorization middleware
export const requirePermission = (...requiredPermissions: (keyof typeof permissions)[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      logger.warn('Insufficient permissions', {
        userId: req.user.sub,
        requiredPermissions,
        userPermissions,
        path: req.path,
      });
      
      return next(new UnauthorizedError('Insufficient permissions'));
    }

    next();
  };
};

// Role-based authorization middleware
export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const userRoles = req.user.roles || [];
    const hasRole = roles.some(role => userRoles.includes(role));

    if (!hasRole) {
      logger.warn('Insufficient role', {
        userId: req.user.sub,
        requiredRoles: roles,
        userRoles,
        path: req.path,
      });
      
      return next(new UnauthorizedError('Insufficient role permissions'));
    }

    next();
  };
};

// Admin role middleware
export const requireAdmin = requireRole('admin');

// Check if user can access workflow session
export const canAccessWorkflowSession = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const sessionId = req.params.sessionId || req.params.uniqueUrl;
  
  if (!sessionId) {
    return next(new UnauthorizedError('Session ID required'));
  }

  // Allow authenticated users with specific workflow access
  if (req.user) {
    const workflowAccess = req.user.app_metadata?.workflowAccess || [];
    const hasAccess = workflowAccess.includes(sessionId) || 
                     req.user.roles.includes(UserRole.ADMIN);
    
    if (hasAccess) {
      return next();
    }
  }

  // Allow access via recipient session (for unauthenticated workflow participants)
  const recipientSessionId = req.cookies?.[`recipient_${sessionId}`];
  if (recipientSessionId) {
    // TODO: Validate recipient session in Redis
    return next();
  }

  logger.warn('Workflow session access denied', {
    userId: req.user?.sub,
    sessionId,
    userRoles: req.user?.roles,
    path: req.path,
  });
  
  return next(new UnauthorizedError('Workflow session access denied'));
};

// Rate limiting based on authentication status
export const authBasedRateLimit = {
  // More lenient limits for authenticated users
  authenticated: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per window
    message: 'Too many requests from authenticated user',
  },
  // Stricter limits for unauthenticated users
  unauthenticated: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many requests - please authenticate for higher limits',
  },
};

// Development utilities
export const developmentAuth = {
  // Create development session
  async createDevSession(req: Request, res: Response, userId: string, roles: UserRole[] = [UserRole.PATIENT]): Promise<void> {
    if (config.server.nodeEnv !== 'development') {
      throw new Error('Development auth only available in development mode');
    }

    const mockUser: UserProfile = {
      sub: userId,
      email: `${userId}@example.com`,
      email_verified: true,
      name: `Dev User ${userId}`,
      roles,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_metadata: {},
      app_metadata: { roles },
    };

    const { sessionId, csrfToken } = await createSession(userId, mockUser, req);
    
    res.cookie(sessionConfig.name, sessionId, {
      maxAge: sessionConfig.maxAge,
      httpOnly: sessionConfig.httpOnly,
      secure: sessionConfig.secure,
      sameSite: sessionConfig.sameSite,
    });

    res.cookie('csrf-token', csrfToken, {
      maxAge: csrfConfig.maxAge,
      httpOnly: csrfConfig.httpOnly,
      secure: csrfConfig.secure,
      sameSite: csrfConfig.sameSite,
    });

    logger.info('Development session created', { userId, roles });
  },

  // Generate development JWT
  generateDevToken(userId: string, roles: UserRole[] = [UserRole.PATIENT]): string {
    if (config.server.nodeEnv !== 'development') {
      throw new Error('Development auth only available in development mode');
    }

    return generateToken({
      sub: userId,
      email: `${userId}@example.com`,
      name: `Dev User ${userId}`,
      roles,
      permissions: roles.flatMap(role => {
        const rolePermissions = {
          [UserRole.PATIENT]: ['read:documents', 'write:documents'],
          [UserRole.PROVIDER]: ['read:documents', 'write:documents', 'create:workflows', 'read:users'],
          [UserRole.ADMIN]: Object.keys(permissions),
        };
        return rolePermissions[role] || [];
      }),
    });
  },
};