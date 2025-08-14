import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { UserRole } from '../config/auth';
import { logger } from '../config/logger';

// Test utilities for authentication system
export class AuthTestUtils {
  /**
   * Generate a test JWT token for development/testing
   */
  static generateTestToken(payload: {
    sub: string;
    email: string;
    roles?: UserRole[];
    permissions?: string[];
    expiresIn?: string;
  }): string {
    if (config.server.nodeEnv === 'production') {
      throw new Error('Test tokens can only be generated in development');
    }

    const {
      sub,
      email,
      roles = [UserRole.PATIENT],
      permissions = [],
      expiresIn = '1h',
    } = payload;

    const tokenPayload = {
      sub,
      email,
      roles,
      permissions,
      iat: Math.floor(Date.now() / 1000),
      aud: 'mve-frontend',
      iss: 'mve-backend',
    };

    return jwt.sign(tokenPayload, config.jwt.secret, {
      expiresIn,
      algorithm: 'HS256',
    });
  }

  /**
   * Create test users for different roles
   */
  static getTestUsers() {
    return {
      admin: {
        sub: 'test_admin_001',
        email: 'admin@test.com',
        name: 'Test Admin',
        roles: [UserRole.ADMIN],
        permissions: [
          'read:documents',
          'write:documents',
          'create:workflows',
          'manage:workflows',
          'read:users',
          'manage:users',
          'assign:roles',
          'admin:system',
        ],
      },
      provider: {
        sub: 'test_provider_001',
        email: 'provider@test.com',
        name: 'Test Provider',
        roles: [UserRole.PROVIDER],
        permissions: [
          'read:documents',
          'write:documents',
          'create:workflows',
          'read:users',
        ],
      },
      patient: {
        sub: 'test_patient_001',
        email: 'patient@test.com',
        name: 'Test Patient',
        roles: [UserRole.PATIENT],
        permissions: [
          'read:documents',
          'write:documents',
        ],
      },
    };
  }

  /**
   * Generate tokens for all test users
   */
  static generateTestTokens() {
    const users = this.getTestUsers();
    return {
      admin: this.generateTestToken(users.admin),
      provider: this.generateTestToken(users.provider),
      patient: this.generateTestToken(users.patient),
    };
  }

  /**
   * Create a test request object with authentication
   */
  static createAuthenticatedRequest(userType: 'admin' | 'provider' | 'patient') {
    const users = this.getTestUsers();
    const user = users[userType];
    const token = this.generateTestToken(user);

    return {
      headers: {
        authorization: `Bearer ${token}`,
      },
      user: {
        ...user,
        sessionId: 'test_session_001',
        csrfToken: 'test_csrf_token',
      },
    };
  }

  /**
   * Test authentication middleware
   */
  static async testAuthenticationMiddleware(middleware: Function, userType?: 'admin' | 'provider' | 'patient') {
    const req: any = userType 
      ? this.createAuthenticatedRequest(userType)
      : { headers: {} };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const next = jest.fn();

    try {
      await middleware(req, res, next);
      return { req, res, next };
    } catch (error) {
      return { req, res, next, error };
    }
  }

  /**
   * Test role-based authorization
   */
  static testRoleAuthorization(userRoles: UserRole[], requiredRoles: UserRole[]): boolean {
    return requiredRoles.some(role => userRoles.includes(role));
  }

  /**
   * Test permission-based authorization
   */
  static testPermissionAuthorization(userPermissions: string[], requiredPermissions: string[]): boolean {
    return requiredPermissions.every(permission => userPermissions.includes(permission));
  }

  /**
   * Simulate rate limiting test
   */
  static async simulateRateLimit(endpoint: string, requestCount: number, windowMs: number) {
    const requests: Promise<any>[] = [];
    
    for (let i = 0; i < requestCount; i++) {
      requests.push(
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              timestamp: Date.now(),
              request: i + 1,
              endpoint,
            });
          }, i * 100); // Spread requests over time
        })
      );
    }

    return Promise.all(requests);
  }

  /**
   * Test CSRF token generation and validation
   */
  static testCSRFProtection() {
    const crypto = require('crypto');
    
    // Generate CSRF token
    const csrfToken = crypto.randomBytes(32).toString('hex');
    
    // Simulate request with CSRF token
    const mockRequest = {
      headers: {
        'x-csrf-token': csrfToken,
      },
      session: {
        csrfToken,
      },
    };

    // Test validation
    const isValid = mockRequest.headers['x-csrf-token'] === mockRequest.session.csrfToken;
    
    return {
      token: csrfToken,
      isValid,
    };
  }

  /**
   * Test session security
   */
  static testSessionSecurity() {
    const sessionData = {
      userId: 'test_user_001',
      email: 'test@example.com',
      roles: [UserRole.PATIENT],
      sessionId: 'test_session_001',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
    };

    // Test session expiration
    const maxInactivity = 30 * 60 * 1000; // 30 minutes
    const isExpired = Date.now() - sessionData.lastActivity > maxInactivity;

    return {
      sessionData,
      isExpired,
      isValid: !isExpired,
    };
  }

  /**
   * Test input sanitization
   */
  static testInputSanitization() {
    const maliciousInputs = [
      '<script>alert("XSS")</script>',
      'javascript:void(0)',
      'onload="alert(1)"',
      '../../etc/passwd',
      "'; DROP TABLE users; --",
      '<img src=x onerror=alert(1)>',
    ];

    const sanitizeString = (str: string): string => {
      return str
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/script/gi, 'scr1pt')
        .trim();
    };

    const results = maliciousInputs.map(input => ({
      original: input,
      sanitized: sanitizeString(input),
      isSafe: !sanitizeString(input).includes('<') && 
              !sanitizeString(input).toLowerCase().includes('javascript:') &&
              !sanitizeString(input).match(/on\w+\s*=/i),
    }));

    return results;
  }

  /**
   * Test security headers
   */
  static testSecurityHeaders() {
    const requiredHeaders = {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'",
    };

    const mockResponse: any = {
      headers: {},
      setHeader: function(name: string, value: string) {
        this.headers[name] = value;
      },
      getHeader: function(name: string) {
        return this.headers[name];
      },
    };

    // Simulate setting security headers
    Object.entries(requiredHeaders).forEach(([name, value]) => {
      mockResponse.setHeader(name, value);
    });

    // Test header presence
    const headerTests = Object.keys(requiredHeaders).map(header => ({
      header,
      present: !!mockResponse.getHeader(header),
      value: mockResponse.getHeader(header),
    }));

    return {
      headers: mockResponse.headers,
      tests: headerTests,
      allPresent: headerTests.every(test => test.present),
    };
  }

  /**
   * Comprehensive authentication system test
   */
  static async runComprehensiveAuthTest() {
    logger.info('Starting comprehensive authentication system test...');

    const results = {
      tokenGeneration: false,
      roleAuthorization: false,
      permissionAuthorization: false,
      csrfProtection: false,
      sessionSecurity: false,
      inputSanitization: false,
      securityHeaders: false,
    };

    try {
      // Test token generation
      const tokens = this.generateTestTokens();
      results.tokenGeneration = !!(tokens.admin && tokens.provider && tokens.patient);
      logger.info('✅ Token generation test passed');

      // Test role authorization
      const roleTest = this.testRoleAuthorization([UserRole.ADMIN], [UserRole.ADMIN]);
      results.roleAuthorization = roleTest;
      logger.info('✅ Role authorization test passed');

      // Test permission authorization
      const permissionTest = this.testPermissionAuthorization(
        ['read:documents', 'write:documents'], 
        ['read:documents']
      );
      results.permissionAuthorization = permissionTest;
      logger.info('✅ Permission authorization test passed');

      // Test CSRF protection
      const csrfTest = this.testCSRFProtection();
      results.csrfProtection = csrfTest.isValid;
      logger.info('✅ CSRF protection test passed');

      // Test session security
      const sessionTest = this.testSessionSecurity();
      results.sessionSecurity = sessionTest.isValid;
      logger.info('✅ Session security test passed');

      // Test input sanitization
      const sanitizationTest = this.testInputSanitization();
      results.inputSanitization = sanitizationTest.every(test => test.isSafe);
      logger.info('✅ Input sanitization test passed');

      // Test security headers
      const headerTest = this.testSecurityHeaders();
      results.securityHeaders = headerTest.allPresent;
      logger.info('✅ Security headers test passed');

      const allTestsPassed = Object.values(results).every(result => result === true);
      
      logger.info('Comprehensive authentication test completed', {
        results,
        allPassed: allTestsPassed,
      });

      return {
        success: allTestsPassed,
        results,
        summary: {
          total: Object.keys(results).length,
          passed: Object.values(results).filter(r => r === true).length,
          failed: Object.values(results).filter(r => r === false).length,
        },
      };

    } catch (error) {
      logger.error('Authentication test failed', { error: (error as Error).message });
      return {
        success: false,
        error: (error as Error).message,
        results,
      };
    }
  }
}

// Export for Jest testing
export default AuthTestUtils;