import { config } from './env';

// Security headers configuration
export const securityHeaders = {
  // Strict Transport Security - force HTTPS
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // Content Security Policy
  csp: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for PDF.js
        "https://cdn.auth0.com",
        "https://*.auth0.com",
        config.server.nodeEnv === 'development' ? "'unsafe-eval'" : null,
      ].filter(Boolean),
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for MUI
        "https://fonts.googleapis.com",
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:",
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https:",
        "https://s.gravatar.com",
        "https://lh3.googleusercontent.com", // Google profile pictures
        "https://platform-lookaside.fbsbx.com", // Facebook profile pictures
        "https://avatars.githubusercontent.com", // GitHub profile pictures
      ],
      connectSrc: [
        "'self'",
        "https://api.auth0.com",
        "https://*.auth0.com",
        config.server.baseUrl,
        config.server.nodeEnv === 'development' ? "http://localhost:*" : null,
      ].filter(Boolean),
      frameSrc: [
        "'self'",
        "https://*.auth0.com",
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    reportOnly: config.server.nodeEnv === 'development',
  },

  // X-Frame-Options
  frameOptions: 'DENY',

  // X-Content-Type-Options
  contentTypeOptions: 'nosniff',

  // X-XSS-Protection
  xssProtection: {
    enabled: true,
    mode: 'block',
  },

  // Referrer Policy
  referrerPolicy: 'strict-origin-when-cross-origin',

  // Permissions Policy
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    notifications: ['self'],
    payment: [],
  },
};

// CORS configuration
export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      config.server.frontendUrl,
      'https://mve.zpaper.com',
      'https://*.zpaper.com',
    ];

    // Development origins
    if (config.server.nodeEnv === 'development') {
      allowedOrigins.push(
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173'
      );
    }

    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        const pattern = allowedOrigin.replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`).test(origin);
      }
      return allowedOrigin === origin;
    });

    callback(null, isAllowed);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-CSRF-Token',
    'X-Forwarded-For',
    'X-Real-IP',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Rate limiting configuration
export const rateLimitConfig = {
  // Global rate limit
  global: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later',
    skipSuccessfulRequests: false,
  },

  // Auth-specific rate limits
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window for sensitive endpoints
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
  },

  // Login specific (stricter)
  login: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // 3 login attempts per window
    skipFailedRequests: false,
    message: 'Too many login attempts, please try again in 15 minutes',
  },

  // Password reset (prevent abuse)
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 password reset attempts per hour
    message: 'Too many password reset attempts, please try again later',
  },

  // File upload limits
  upload: {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 uploads per minute
    message: 'Too many upload attempts, please try again later',
  },

  // API endpoints
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requests per window for API endpoints
    message: 'API rate limit exceeded, please try again later',
  },
};

// Input sanitization and validation
export const sanitizationConfig = {
  // HTML sanitization options
  html: {
    allowedTags: [], // No HTML tags allowed
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  },

  // File upload validation
  fileUpload: {
    allowedMimeTypes: {
      images: [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
      ],
      documents: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    },
    maxFileSize: 25 * 1024 * 1024, // 25MB
    maxFiles: 10,
  },

  // Input length limits
  inputLimits: {
    email: 320, // RFC 5321 limit
    name: 100,
    password: 128,
    description: 2000,
    url: 2048,
    phoneNumber: 20,
    npi: 10,
  },

  // Password requirements
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: true,
    bannedPasswords: [
      'password',
      '123456',
      'qwerty',
      'admin',
      'letmein',
    ],
  },
};

// Session security configuration
export const sessionSecurity = {
  // Session cookie settings
  cookie: {
    name: 'mve.session',
    httpOnly: true,
    secure: config.server.nodeEnv === 'production',
    sameSite: 'strict' as const,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    domain: config.server.nodeEnv === 'production' ? '.zpaper.com' : undefined,
    path: '/',
  },

  // CSRF protection settings
  csrf: {
    cookie: {
      name: 'mve.csrf',
      httpOnly: false, // Must be accessible to JavaScript
      secure: config.server.nodeEnv === 'production',
      sameSite: 'strict' as const,
      maxAge: 60 * 60 * 1000, // 1 hour
    },
    headerName: 'X-CSRF-Token',
    excludePaths: [
      '/api/health',
      '/api/auth/callback',
      '/api/auth/logout',
    ],
    excludeMethods: ['GET', 'HEAD', 'OPTIONS'],
  },

  // Session management
  maxConcurrentSessions: 5,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes of inactivity
  absoluteTimeout: 8 * 60 * 60 * 1000, // 8 hours absolute
  rollingTimeout: true,
};

// Audit logging configuration
export const auditConfig = {
  // Events to log
  events: {
    auth: [
      'login_success',
      'login_failure',
      'logout',
      'password_change',
      'password_reset_request',
      'password_reset_success',
      'email_verification',
      'role_change',
      'account_lock',
      'account_unlock',
    ],
    data: [
      'document_access',
      'document_upload',
      'document_download',
      'workflow_create',
      'workflow_complete',
      'form_submit',
    ],
    admin: [
      'user_create',
      'user_delete',
      'user_role_change',
      'system_config_change',
      'bulk_operation',
    ],
    security: [
      'rate_limit_exceeded',
      'csrf_violation',
      'invalid_token',
      'suspicious_activity',
      'multiple_login_attempts',
    ],
  },

  // Sensitive fields to exclude from logs
  excludeFields: [
    'password',
    'token',
    'secret',
    'key',
    'ssn',
    'social_security',
    'credit_card',
    'cvv',
  ],

  // Log retention
  retentionDays: {
    auth: 90,
    data: 365,
    admin: 1825, // 5 years
    security: 365,
  },
};

// Encryption settings
export const encryptionConfig = {
  // JWT settings
  jwt: {
    algorithm: 'RS256' as const,
    issuer: 'mve-backend',
    audience: 'mve-frontend',
    expiresIn: '15m',
    refreshExpiresIn: '7d',
    clockTolerance: 30,
  },

  // Password hashing
  password: {
    algorithm: 'argon2id',
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
  },

  // Data encryption at rest
  dataEncryption: {
    algorithm: 'aes-256-gcm',
    keyRotationDays: 90,
    ivLength: 16,
    tagLength: 16,
  },
};

// Monitoring and alerting thresholds
export const monitoringConfig = {
  // Alert thresholds
  alerts: {
    failedLoginAttempts: 5, // per IP per 15 minutes
    rateLimitViolations: 10, // per IP per hour
    errorRate: 0.05, // 5% error rate
    responseTimeP99: 2000, // 2 seconds
    memoryUsage: 0.85, // 85% memory usage
    cpuUsage: 0.8, // 80% CPU usage
  },

  // Health check intervals
  healthChecks: {
    database: 30000, // 30 seconds
    redis: 15000, // 15 seconds
    external: 60000, // 1 minute
  },

  // Metrics collection
  metrics: {
    enabled: true,
    interval: 10000, // 10 seconds
    retention: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
};

// Export all security configurations
export const securityConfig = {
  headers: securityHeaders,
  cors: corsConfig,
  rateLimit: rateLimitConfig,
  sanitization: sanitizationConfig,
  session: sessionSecurity,
  audit: auditConfig,
  encryption: encryptionConfig,
  monitoring: monitoringConfig,
};