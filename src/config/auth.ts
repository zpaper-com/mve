import { ManagementClient, AuthenticationClient } from 'auth0';
import { config } from './env';
import { logger } from './logger';

// Auth0 Management Client for admin operations
export const managementClient = config.auth0.domain && config.auth0.clientSecret ? new ManagementClient({
  domain: config.auth0.domain,
  clientId: config.auth0.clientId!,
  clientSecret: config.auth0.clientSecret,
  scope: 'read:users update:users create:users delete:users read:roles create:roles update:roles delete:roles read:users_app_metadata update:users_app_metadata',
}) : null;

// Auth0 Authentication Client for token operations
export const authenticationClient = config.auth0.domain ? new AuthenticationClient({
  domain: config.auth0.domain,
  clientId: config.auth0.clientId!,
}) : null;

// User roles configuration
export enum UserRole {
  PATIENT = 'patient',
  PROVIDER = 'provider',
  ADMIN = 'admin',
}

// Auth0 user metadata structure
export interface Auth0UserMetadata {
  mobileNumber?: string;
  npi?: string; // National Provider Identifier for healthcare providers
  preferredNotification?: 'email' | 'sms' | 'both';
  timezone?: string;
  lastLoginAt?: string;
  registrationCompleted?: boolean;
}

// Auth0 app metadata structure (managed by system)
export interface Auth0AppMetadata {
  roles: UserRole[];
  invitedBy?: string;
  inviteAcceptedAt?: string;
  workflowAccess?: string[]; // Array of workflow session IDs user can access
  permissions?: string[];
}

// Complete user profile with Auth0 data
export interface UserProfile {
  sub: string; // Auth0 user ID
  email: string;
  email_verified: boolean;
  name?: string;
  nickname?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
  user_metadata?: Auth0UserMetadata;
  app_metadata?: Auth0AppMetadata;
  roles: UserRole[];
  created_at: string;
  updated_at: string;
  last_login?: string;
  login_count?: number;
}

// Auth0 configuration for different environments
export const auth0Config = {
  production: {
    domain: config.auth0.domain,
    clientId: config.auth0.clientId,
    audience: config.auth0.audience,
    scope: 'openid profile email phone',
    redirectUri: `${config.server.baseUrl}/auth/callback`,
    logoutUri: `${config.server.baseUrl}/auth/logout`,
    algorithms: ['RS256'] as const,
    tokenLeeway: 30, // seconds
    clockTolerance: 30, // seconds
    issuer: config.auth0.domain ? `https://${config.auth0.domain}/` : undefined,
  },
  development: {
    domain: config.auth0.domain || 'dev-placeholder.us.auth0.com',
    clientId: config.auth0.clientId || 'dev-placeholder-client-id',
    audience: config.auth0.audience || 'mve-api',
    scope: 'openid profile email phone',
    redirectUri: 'http://localhost:3000/auth/callback',
    logoutUri: 'http://localhost:3000/auth/logout',
    algorithms: ['RS256', 'HS256'] as const, // Allow HS256 for dev
    tokenLeeway: 60, // More lenient for dev
    clockTolerance: 60,
    issuer: config.auth0.domain ? `https://${config.auth0.domain}/` : 'mve-backend',
  },
};

// Get environment-specific Auth0 configuration
export const getAuth0Config = () => {
  return config.server.nodeEnv === 'production' 
    ? auth0Config.production 
    : auth0Config.development;
};

// Auth0 Social Provider Configuration
export const socialProviders = {
  google: {
    connection: 'google-oauth2',
    scope: 'openid profile email',
    additionalParameters: {
      access_type: 'offline',
      prompt: 'consent',
    },
  },
  facebook: {
    connection: 'facebook',
    scope: 'public_profile,email',
  },
  github: {
    connection: 'github',
    scope: 'user:email',
  },
  apple: {
    connection: 'apple',
    scope: 'openid name email',
  },
};

// Permission definitions
export const permissions = {
  // Document permissions
  'read:documents': 'Read document content',
  'write:documents': 'Edit document content',
  'create:workflows': 'Create new workflows',
  'manage:workflows': 'Manage all workflows',
  
  // User management permissions
  'read:users': 'View user profiles',
  'manage:users': 'Create, update, and delete users',
  'assign:roles': 'Assign roles to users',
  
  // Administrative permissions
  'admin:system': 'Full system administration',
  'admin:analytics': 'View system analytics',
  'admin:audit': 'Access audit logs',
} as const;

// Role-to-permission mappings
export const rolePermissions: Record<UserRole, (keyof typeof permissions)[]> = {
  [UserRole.PATIENT]: [
    'read:documents',
    'write:documents',
  ],
  [UserRole.PROVIDER]: [
    'read:documents',
    'write:documents',
    'create:workflows',
    'read:users',
  ],
  [UserRole.ADMIN]: [
    'read:documents',
    'write:documents',
    'create:workflows',
    'manage:workflows',
    'read:users',
    'manage:users',
    'assign:roles',
    'admin:system',
    'admin:analytics',
    'admin:audit',
  ],
};

// Auth0 Management API helpers
export class Auth0Service {
  private static instance: Auth0Service;

  private constructor() {}

  static getInstance(): Auth0Service {
    if (!Auth0Service.instance) {
      Auth0Service.instance = new Auth0Service();
    }
    return Auth0Service.instance;
  }

  // Create user with custom metadata
  async createUser(userData: {
    email: string;
    password?: string;
    name?: string;
    connection?: string;
    userMetadata?: Auth0UserMetadata;
    appMetadata?: Partial<Auth0AppMetadata>;
  }): Promise<UserProfile | null> {
    if (!managementClient) {
      logger.warn('Auth0 Management Client not configured');
      return null;
    }

    try {
      const user = await managementClient.users.create({
        email: userData.email,
        password: userData.password,
        name: userData.name,
        connection: userData.connection || 'Username-Password-Authentication',
        user_metadata: userData.userMetadata || {},
        app_metadata: {
          roles: [UserRole.PATIENT], // Default role
          ...userData.appMetadata,
        },
        email_verified: false,
        verify_email: true,
      });

      logger.info('User created successfully', { 
        userId: user.data.user_id, 
        email: userData.email 
      });

      return user.data as UserProfile;
    } catch (error: any) {
      logger.error('Failed to create user', { 
        error: error.message, 
        email: userData.email 
      });
      throw new Error(`User creation failed: ${error.message}`);
    }
  }

  // Get user by ID with complete profile
  async getUser(userId: string): Promise<UserProfile | null> {
    if (!managementClient) {
      logger.warn('Auth0 Management Client not configured');
      return null;
    }

    try {
      const user = await managementClient.users.get({ 
        id: userId,
        include_fields: true,
        fields: 'user_id,email,email_verified,name,nickname,picture,given_name,family_name,locale,user_metadata,app_metadata,created_at,updated_at,last_login,logins_count',
      });

      // Extract roles from app_metadata
      const roles = (user.data.app_metadata as Auth0AppMetadata)?.roles || [UserRole.PATIENT];

      return {
        ...user.data,
        roles,
      } as UserProfile;
    } catch (error: any) {
      logger.error('Failed to get user', { error: error.message, userId });
      return null;
    }
  }

  // Update user metadata
  async updateUserMetadata(userId: string, metadata: Partial<Auth0UserMetadata>): Promise<boolean> {
    if (!managementClient) {
      logger.warn('Auth0 Management Client not configured');
      return false;
    }

    try {
      await managementClient.users.update(
        { id: userId },
        { user_metadata: metadata }
      );

      logger.info('User metadata updated', { userId, metadata });
      return true;
    } catch (error: any) {
      logger.error('Failed to update user metadata', { 
        error: error.message, 
        userId 
      });
      return false;
    }
  }

  // Assign roles to user
  async assignRoles(userId: string, roles: UserRole[]): Promise<boolean> {
    if (!managementClient) {
      logger.warn('Auth0 Management Client not configured');
      return false;
    }

    try {
      await managementClient.users.update(
        { id: userId },
        { 
          app_metadata: { 
            roles,
            permissions: this.getRolePermissions(roles),
          } 
        }
      );

      logger.info('User roles assigned', { userId, roles });
      return true;
    } catch (error: any) {
      logger.error('Failed to assign roles', { 
        error: error.message, 
        userId, 
        roles 
      });
      return false;
    }
  }

  // Get permissions for roles
  private getRolePermissions(roles: UserRole[]): string[] {
    const allPermissions = new Set<string>();
    
    roles.forEach(role => {
      rolePermissions[role]?.forEach(permission => {
        allPermissions.add(permission);
      });
    });

    return Array.from(allPermissions);
  }

  // Send password reset email
  async sendPasswordReset(email: string): Promise<boolean> {
    if (!managementClient) {
      logger.warn('Auth0 Management Client not configured');
      return false;
    }

    try {
      await managementClient.jobs.createPasswordChangeTicket({
        user_id: undefined, // Will be resolved by email
        email,
        connection_id: 'Username-Password-Authentication',
        ttl_sec: 3600, // 1 hour
      });

      logger.info('Password reset email sent', { email });
      return true;
    } catch (error: any) {
      logger.error('Failed to send password reset', { 
        error: error.message, 
        email 
      });
      return false;
    }
  }

  // Grant workflow access to user
  async grantWorkflowAccess(userId: string, sessionId: string): Promise<boolean> {
    try {
      const user = await this.getUser(userId);
      if (!user) return false;

      const currentAccess = user.app_metadata?.workflowAccess || [];
      const updatedAccess = [...new Set([...currentAccess, sessionId])];

      await managementClient?.users.update(
        { id: userId },
        { 
          app_metadata: { 
            ...user.app_metadata,
            workflowAccess: updatedAccess,
          } 
        }
      );

      logger.info('Workflow access granted', { userId, sessionId });
      return true;
    } catch (error: any) {
      logger.error('Failed to grant workflow access', { 
        error: error.message, 
        userId, 
        sessionId 
      });
      return false;
    }
  }

  // Validate NPI number (basic validation)
  validateNPI(npi: string): boolean {
    // NPI is a 10-digit number with Luhn algorithm check
    if (!/^\d{10}$/.test(npi)) return false;
    
    // Luhn algorithm validation
    const digits = npi.split('').map(Number);
    let sum = 0;
    
    for (let i = digits.length - 2; i >= 0; i -= 2) {
      let doubled = digits[i] * 2;
      if (doubled > 9) doubled -= 9;
      sum += doubled;
    }
    
    for (let i = digits.length - 1; i >= 0; i -= 2) {
      sum += digits[i];
    }
    
    return sum % 10 === 0;
  }
}

// Export singleton instance
export const auth0Service = Auth0Service.getInstance();

// Session configuration for Redis
export const sessionConfig = {
  name: 'mve.session',
  secret: config.session.secret,
  maxAge: config.session.maxAge,
  secure: config.server.nodeEnv === 'production',
  httpOnly: true,
  sameSite: 'strict' as const,
  domain: config.server.nodeEnv === 'production' ? '.zpaper.com' : undefined,
  path: '/',
  rolling: true, // Reset expiration on each request
};

// CSRF token configuration
export const csrfConfig = {
  name: 'mve.csrf',
  secret: config.session.secret,
  maxAge: 3600000, // 1 hour
  secure: config.server.nodeEnv === 'production',
  sameSite: 'strict' as const,
  httpOnly: false, // CSRF token needs to be readable by JavaScript
};

// Auth0 webhook signature validation
export function validateAuth0Webhook(
  payload: string, 
  signature: string, 
  secret: string
): boolean {
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
    
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expectedSignature}`)
  );
}