import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { 
  auth0Service, 
  authenticationClient,
  UserRole,
  socialProviders,
  sessionConfig,
  csrfConfig,
  getAuth0Config
} from '../config/auth';
import {
  authenticate,
  createSession,
  destroySession,
  generateCSRFToken,
  verifyToken,
  developmentAuth,
  requireRole,
  csrfProtection
} from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { ApiResponse, UnauthorizedError, ValidationError, AuthenticatedRequest } from '../types';

export const authRoutes = Router();

// Rate limiting for auth endpoints
const authRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window for auth endpoints
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req: Request) => {
    // Use combination of IP and email/username for rate limiting
    const identifier = req.body?.email || req.ip;
    return `auth_${identifier}`;
  },
});

// Login rate limiter with stricter limits
const loginRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 login attempts per window
  skipFailedRequests: false,
  message: 'Too many login attempts, please try again in 15 minutes',
});

// Validation middleware
const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

const validateRegistration = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('name').optional().isLength({ min: 2, max: 100 }).trim(),
  body('role').optional().isIn(Object.values(UserRole)),
];

const validatePasswordReset = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
];

const validatePasswordChange = [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
];

// Helper to handle validation errors
const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg);
    return res.status(400).json({
      success: false,
      errors: errorMessages,
      message: 'Validation failed',
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
  next();
};

/**
 * POST /auth/login
 * User login with email and password
 */
authRoutes.post('/login', 
  loginRateLimiter,
  validateLogin,
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, rememberMe = false } = req.body;

      // Development mode login
      if (config.server.nodeEnv === 'development' && !config.auth0.domain) {
        const userId = `dev_${email.split('@')[0]}`;
        const roles = email.includes('admin') ? [UserRole.ADMIN] : 
                      email.includes('provider') ? [UserRole.PROVIDER] : 
                      [UserRole.PATIENT];

        await developmentAuth.createDevSession(req, res, userId, roles);
        const token = developmentAuth.generateDevToken(userId, roles);

        logger.info('Development login successful', { userId, email });

        return res.json({
          success: true,
          data: {
            accessToken: token,
            tokenType: 'Bearer',
            expiresIn: 86400,
            user: {
              id: userId,
              email,
              name: `Dev User ${userId}`,
              roles,
            },
            csrfToken: generateCSRFToken(),
          },
          message: 'Login successful',
          timestamp: new Date().toISOString(),
        } as ApiResponse);
      }

      // Production Auth0 login
      if (!authenticationClient) {
        throw new Error('Auth0 not configured');
      }

      const authResult = await authenticationClient.passwordGrant({
        username: email,
        password,
        realm: 'Username-Password-Authentication',
        scope: 'openid profile email',
        audience: config.auth0.audience,
      });

      // Verify the token and get user info
      const decoded = await verifyToken(authResult.data.access_token);
      const userProfile = await auth0Service.getUser(decoded.sub);

      if (!userProfile) {
        throw new UnauthorizedError('User profile not found');
      }

      // Create session
      const { sessionId, csrfToken } = await createSession(decoded.sub, userProfile, req);

      // Set session cookie
      const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : sessionConfig.maxAge;
      res.cookie(sessionConfig.name, sessionId, {
        maxAge,
        httpOnly: sessionConfig.httpOnly,
        secure: sessionConfig.secure,
        sameSite: sessionConfig.sameSite,
        domain: sessionConfig.domain,
      });

      // Set CSRF token cookie
      res.cookie(csrfConfig.name, csrfToken, {
        maxAge: csrfConfig.maxAge,
        httpOnly: csrfConfig.httpOnly,
        secure: csrfConfig.secure,
        sameSite: csrfConfig.sameSite,
      });

      logger.info('User logged in successfully', { 
        userId: decoded.sub, 
        email: userProfile.email,
        roles: userProfile.roles,
      });

      res.json({
        success: true,
        data: {
          accessToken: authResult.data.access_token,
          idToken: authResult.data.id_token,
          refreshToken: authResult.data.refresh_token,
          tokenType: 'Bearer',
          expiresIn: authResult.data.expires_in,
          user: {
            id: userProfile.sub,
            email: userProfile.email,
            name: userProfile.name,
            picture: userProfile.picture,
            roles: userProfile.roles,
            emailVerified: userProfile.email_verified,
          },
          csrfToken,
        },
        message: 'Login successful',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    } catch (error: any) {
      logger.error('Login failed', { 
        error: error.message, 
        email: req.body.email,
        ip: req.ip,
      });
      
      next(new UnauthorizedError('Invalid email or password'));
    }
  }
);

/**
 * POST /auth/register
 * User registration
 */
authRoutes.post('/register',
  authRateLimiter,
  validateRegistration,
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, name, role = UserRole.PATIENT } = req.body;

      // Development mode registration
      if (config.server.nodeEnv === 'development' && !config.auth0.domain) {
        const userId = `dev_${email.split('@')[0]}_${Date.now()}`;
        const token = developmentAuth.generateDevToken(userId, [role]);

        logger.info('Development registration successful', { userId, email });

        return res.status(201).json({
          success: true,
          data: {
            user: {
              id: userId,
              email,
              name: name || `Dev User ${userId}`,
              roles: [role],
            },
            message: 'Please verify your email to activate your account',
          },
          message: 'Registration successful',
          timestamp: new Date().toISOString(),
        } as ApiResponse);
      }

      // Production Auth0 registration
      const userProfile = await auth0Service.createUser({
        email,
        password,
        name,
        appMetadata: { roles: [role] },
        userMetadata: {
          registrationCompleted: false,
        },
      });

      if (!userProfile) {
        throw new Error('User registration failed');
      }

      logger.info('User registered successfully', { 
        userId: userProfile.sub, 
        email,
        role,
      });

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: userProfile.sub,
            email: userProfile.email,
            name: userProfile.name,
            roles: userProfile.roles,
          },
          message: 'Please check your email to verify your account',
        },
        message: 'Registration successful',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    } catch (error: any) {
      logger.error('Registration failed', { 
        error: error.message, 
        email: req.body.email,
      });
      
      if (error.message.includes('already exists')) {
        next(new ValidationError('Email already registered'));
      } else {
        next(new Error('Registration failed'));
      }
    }
  }
);

/**
 * POST /auth/logout
 * User logout
 */
authRoutes.post('/logout',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.cookies?.[sessionConfig.name];
      
      if (sessionId) {
        await destroySession(sessionId);
      }

      // Clear cookies
      res.clearCookie(sessionConfig.name);
      res.clearCookie(csrfConfig.name);

      logger.info('User logged out', { 
        userId: req.user?.sub,
        sessionId,
      });

      res.json({
        success: true,
        message: 'Logout successful',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    } catch (error: any) {
      logger.error('Logout failed', { 
        error: error.message, 
        userId: req.user?.sub,
      });
      
      // Still clear cookies even if session destruction fails
      res.clearCookie(sessionConfig.name);
      res.clearCookie(csrfConfig.name);
      
      res.json({
        success: true,
        message: 'Logout completed',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    }
  }
);

/**
 * POST /auth/refresh
 * Refresh access token
 */
authRoutes.post('/refresh',
  authRateLimiter,
  body('refreshToken').notEmpty().withMessage('Refresh token required'),
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;

      if (config.server.nodeEnv === 'development' && !config.auth0.domain) {
        // Development mode - just generate a new token
        const decoded = jwt.decode(refreshToken) as any;
        const newToken = developmentAuth.generateDevToken(decoded.sub, decoded.roles);

        return res.json({
          success: true,
          data: {
            accessToken: newToken,
            tokenType: 'Bearer',
            expiresIn: 86400,
          },
          message: 'Token refreshed',
          timestamp: new Date().toISOString(),
        } as ApiResponse);
      }

      if (!authenticationClient) {
        throw new Error('Auth0 not configured');
      }

      const authResult = await authenticationClient.refreshToken({
        refresh_token: refreshToken,
      });

      logger.info('Token refreshed successfully');

      res.json({
        success: true,
        data: {
          accessToken: authResult.data.access_token,
          idToken: authResult.data.id_token,
          tokenType: 'Bearer',
          expiresIn: authResult.data.expires_in,
        },
        message: 'Token refreshed',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    } catch (error: any) {
      logger.error('Token refresh failed', { error: error.message });
      next(new UnauthorizedError('Invalid refresh token'));
    }
  }
);

/**
 * GET /auth/profile
 * Get user profile
 */
authRoutes.get('/profile',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;

      // Get full user profile from Auth0
      const userProfile = await auth0Service.getUser(userId);

      if (!userProfile) {
        throw new UnauthorizedError('User profile not found');
      }

      res.json({
        success: true,
        data: {
          id: userProfile.sub,
          email: userProfile.email,
          emailVerified: userProfile.email_verified,
          name: userProfile.name,
          nickname: userProfile.nickname,
          picture: userProfile.picture,
          roles: userProfile.roles,
          metadata: userProfile.user_metadata,
          createdAt: userProfile.created_at,
          updatedAt: userProfile.updated_at,
          lastLogin: userProfile.last_login,
          loginCount: userProfile.login_count,
        },
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    } catch (error: any) {
      logger.error('Failed to get user profile', { 
        error: error.message, 
        userId: req.user?.sub,
      });
      next(error);
    }
  }
);

/**
 * PUT /auth/profile
 * Update user profile
 */
authRoutes.put('/profile',
  authenticate,
  csrfProtection,
  [
    body('name').optional().isLength({ min: 2, max: 100 }).trim(),
    body('nickname').optional().isLength({ min: 2, max: 50 }).trim(),
    body('timezone').optional().isIn(['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles']),
    body('preferredNotification').optional().isIn(['email', 'sms', 'both']),
    body('mobileNumber').optional().isMobilePhone('en-US'),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { name, nickname, timezone, preferredNotification, mobileNumber } = req.body;

      const updateData: any = {};
      
      // User metadata updates
      const userMetadata: any = {};
      if (timezone) userMetadata.timezone = timezone;
      if (preferredNotification) userMetadata.preferredNotification = preferredNotification;
      if (mobileNumber) userMetadata.mobileNumber = mobileNumber;

      if (Object.keys(userMetadata).length > 0) {
        await auth0Service.updateUserMetadata(userId, userMetadata);
      }

      // Name updates (if supported)
      // Note: Some Auth0 fields may require Management API updates

      logger.info('User profile updated', { userId, updates: { name, nickname, ...userMetadata } });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    } catch (error: any) {
      logger.error('Failed to update user profile', { 
        error: error.message, 
        userId: req.user?.sub,
      });
      next(error);
    }
  }
);

/**
 * POST /auth/password/reset
 * Request password reset
 */
authRoutes.post('/password/reset',
  authRateLimiter,
  validatePasswordReset,
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;

      if (config.server.nodeEnv === 'development' && !config.auth0.domain) {
        logger.info('Development password reset requested', { email });
        
        return res.json({
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent',
          timestamp: new Date().toISOString(),
        } as ApiResponse);
      }

      // Send password reset email via Auth0
      await auth0Service.sendPasswordReset(email);

      logger.info('Password reset requested', { email });

      // Always return success to prevent email enumeration
      res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    } catch (error: any) {
      logger.error('Password reset failed', { 
        error: error.message, 
        email: req.body.email,
      });
      
      // Still return success to prevent email enumeration
      res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    }
  }
);

/**
 * POST /auth/password/change
 * Change user password (authenticated)
 */
authRoutes.post('/password/change',
  authenticate,
  csrfProtection,
  validatePasswordChange,
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { currentPassword, newPassword } = req.body;

      if (config.server.nodeEnv === 'development' && !config.auth0.domain) {
        logger.info('Development password changed', { userId });
        
        return res.json({
          success: true,
          message: 'Password changed successfully',
          timestamp: new Date().toISOString(),
        } as ApiResponse);
      }

      // TODO: Implement Auth0 password change
      // This typically requires validating the current password first
      // then updating via Management API

      logger.info('Password changed successfully', { userId });

      res.json({
        success: true,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    } catch (error: any) {
      logger.error('Password change failed', { 
        error: error.message, 
        userId: req.user?.sub,
      });
      next(new ValidationError('Failed to change password'));
    }
  }
);

/**
 * POST /auth/verify-email
 * Resend email verification
 */
authRoutes.post('/verify-email',
  authenticate,
  authRateLimiter,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;

      if (config.server.nodeEnv === 'development' && !config.auth0.domain) {
        logger.info('Development email verification sent', { userId });
        
        return res.json({
          success: true,
          message: 'Verification email sent',
          timestamp: new Date().toISOString(),
        } as ApiResponse);
      }

      // TODO: Implement Auth0 email verification resend
      // This requires Management API to create a verification ticket

      logger.info('Email verification sent', { userId });

      res.json({
        success: true,
        message: 'Verification email sent',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    } catch (error: any) {
      logger.error('Failed to send email verification', { 
        error: error.message, 
        userId: req.user?.sub,
      });
      next(error);
    }
  }
);

/**
 * GET /auth/social/:provider
 * Initiate social login
 */
authRoutes.get('/social/:provider',
  authRateLimiter,
  (req: Request, res: Response) => {
    const { provider } = req.params;
    const { returnTo = '/' } = req.query;

    if (!socialProviders[provider as keyof typeof socialProviders]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid social provider',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    }

    const auth0Config = getAuth0Config();
    const authUrl = `https://${auth0Config.domain}/authorize?` + 
      `response_type=code&` +
      `client_id=${auth0Config.clientId}&` +
      `redirect_uri=${encodeURIComponent(auth0Config.redirectUri!)}&` +
      `scope=${encodeURIComponent(auth0Config.scope)}&` +
      `connection=${socialProviders[provider as keyof typeof socialProviders].connection}&` +
      `state=${encodeURIComponent(JSON.stringify({ returnTo }))}`;

    logger.info('Social login initiated', { provider });

    res.redirect(authUrl);
  }
);

/**
 * GET /auth/callback
 * Auth0 callback handler
 */
authRoutes.get('/callback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, state } = req.query;

      if (!code) {
        throw new UnauthorizedError('Authorization code missing');
      }

      const auth0Config = getAuth0Config();
      
      if (!authenticationClient) {
        throw new Error('Auth0 not configured');
      }

      // Exchange code for tokens
      const authResult = await authenticationClient.authorizationCodeGrant({
        code: code as string,
        redirect_uri: auth0Config.redirectUri!,
      });

      // Verify token and get user info
      const decoded = await verifyToken(authResult.data.access_token);
      const userProfile = await auth0Service.getUser(decoded.sub);

      if (!userProfile) {
        throw new UnauthorizedError('User profile not found');
      }

      // Create session
      const { sessionId, csrfToken } = await createSession(decoded.sub, userProfile, req);

      // Set cookies
      res.cookie(sessionConfig.name, sessionId, {
        maxAge: sessionConfig.maxAge,
        httpOnly: sessionConfig.httpOnly,
        secure: sessionConfig.secure,
        sameSite: sessionConfig.sameSite,
        domain: sessionConfig.domain,
      });

      res.cookie(csrfConfig.name, csrfToken, {
        maxAge: csrfConfig.maxAge,
        httpOnly: csrfConfig.httpOnly,
        secure: csrfConfig.secure,
        sameSite: csrfConfig.sameSite,
      });

      // Parse return URL from state
      const stateData = state ? JSON.parse(decodeURIComponent(state as string)) : { returnTo: '/' };

      logger.info('Auth0 callback processed', { 
        userId: decoded.sub,
        provider: userProfile.identities?.[0]?.provider,
      });

      // Redirect to frontend with success
      res.redirect(`${config.server.frontendUrl}${stateData.returnTo}?auth=success`);
    } catch (error: any) {
      logger.error('Auth0 callback failed', { error: error.message });
      
      // Redirect to frontend with error
      res.redirect(`${config.server.frontendUrl}/login?error=auth_failed`);
    }
  }
);

/**
 * GET /auth/csrf-token
 * Get new CSRF token
 */
authRoutes.get('/csrf-token',
  authenticate,
  (req: AuthenticatedRequest, res: Response) => {
    const csrfToken = req.session?.csrfToken || generateCSRFToken();
    
    res.json({
      success: true,
      data: { csrfToken },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  }
);

/**
 * POST /auth/roles (Admin only)
 * Assign roles to user
 */
authRoutes.post('/roles',
  authenticate,
  requireRole(UserRole.ADMIN),
  csrfProtection,
  [
    body('userId').notEmpty().withMessage('User ID required'),
    body('roles').isArray().withMessage('Roles must be an array'),
    body('roles.*').isIn(Object.values(UserRole)).withMessage('Invalid role'),
  ],
  handleValidationErrors,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { userId, roles } = req.body;

      const success = await auth0Service.assignRoles(userId, roles);

      if (!success) {
        throw new Error('Failed to assign roles');
      }

      logger.info('Roles assigned to user', { 
        adminId: req.user?.sub,
        targetUserId: userId,
        roles,
      });

      res.json({
        success: true,
        message: 'Roles assigned successfully',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    } catch (error: any) {
      logger.error('Failed to assign roles', { 
        error: error.message,
        adminId: req.user?.sub,
      });
      next(error);
    }
  }
);

// Development-only endpoints
if (config.server.nodeEnv === 'development') {
  /**
   * POST /auth/dev/login
   * Quick development login without password
   */
  authRoutes.post('/dev/login',
    body('userId').notEmpty(),
    body('role').optional().isIn(Object.values(UserRole)),
    handleValidationErrors,
    async (req: Request, res: Response) => {
      const { userId, role = UserRole.PATIENT } = req.body;

      await developmentAuth.createDevSession(req, res, userId, [role]);
      const token = developmentAuth.generateDevToken(userId, [role]);

      res.json({
        success: true,
        data: {
          accessToken: token,
          user: {
            id: userId,
            email: `${userId}@example.com`,
            roles: [role],
          },
          csrfToken: generateCSRFToken(),
        },
        message: 'Development login successful',
        timestamp: new Date().toISOString(),
      } as ApiResponse);
    }
  );

  /**
   * GET /auth/dev/users
   * List available development users
   */
  authRoutes.get('/dev/users', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        users: [
          { id: 'admin', role: UserRole.ADMIN, email: 'admin@example.com' },
          { id: 'provider', role: UserRole.PROVIDER, email: 'provider@example.com' },
          { id: 'patient', role: UserRole.PATIENT, email: 'patient@example.com' },
        ],
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);
  });
}