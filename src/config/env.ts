import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment schema validation
const envSchema = z.object({
  // Server Configuration
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Database Configuration
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis Configuration
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  REDIS_PASSWORD: z.string().optional(),

  // JWT/Auth0 Configuration
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  AUTH0_DOMAIN: z.string().optional(),
  AUTH0_AUDIENCE: z.string().optional(),
  AUTH0_CLIENT_ID: z.string().optional(),
  AUTH0_CLIENT_SECRET: z.string().optional(),

  // AWS Configuration
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_DOCUMENTS: z.string().default('mve-zpaper-documents'),
  S3_BUCKET_ATTACHMENTS: z.string().default('mve-zpaper-attachments'),
  S3_BUCKET_STATIC: z.string().default('mve-zpaper-static'),

  // CORS Configuration
  CORS_ORIGIN: z.string().default('https://mve.zpaper.com'),
  CORS_ORIGINS: z.string().default('https://mve.zpaper.com,http://localhost:3000,http://localhost:5173'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),

  // Email Configuration
  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@zpaper.com'),
  EMAIL_FROM_NAME: z.string().default('MVE System'),

  // Session Configuration
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_MAX_AGE: z.string().default('86400000').transform(Number),

  // PDF Configuration
  MERX_PDF_URL: z.string().default('https://qr.md/kb/books/merx.pdf'),

  // Application URLs
  BASE_URL: z.string().default('https://mve.zpaper.com'),
  API_BASE_URL: z.string().default('https://mve.zpaper.com/api'),
});

type EnvConfig = z.infer<typeof envSchema>;

// Validate environment variables
let env: EnvConfig;
try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment variables:');
  if (error instanceof z.ZodError) {
    error.errors.forEach((err) => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
  }
  process.exit(1);
}

// Export configuration
export const config = {
  server: {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    baseUrl: env.BASE_URL,
    apiBaseUrl: env.API_BASE_URL,
  },
  database: {
    url: env.DATABASE_URL,
  },
  redis: {
    url: env.REDIS_URL,
    password: env.REDIS_PASSWORD,
  },
  jwt: {
    secret: env.JWT_SECRET,
  },
  auth0: {
    domain: env.AUTH0_DOMAIN,
    audience: env.AUTH0_AUDIENCE,
    clientId: env.AUTH0_CLIENT_ID,
    clientSecret: env.AUTH0_CLIENT_SECRET,
  },
  aws: {
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    s3: {
      documents: env.S3_BUCKET_DOCUMENTS,
      attachments: env.S3_BUCKET_ATTACHMENTS,
      static: env.S3_BUCKET_STATIC,
    },
  },
  cors: {
    origin: env.CORS_ORIGIN,
    origins: env.CORS_ORIGINS.split(',').map(origin => origin.trim()),
  },
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },
  email: {
    sendgridApiKey: env.SENDGRID_API_KEY,
    from: env.EMAIL_FROM,
    fromName: env.EMAIL_FROM_NAME,
  },
  session: {
    secret: env.SESSION_SECRET,
    maxAge: env.SESSION_MAX_AGE,
  },
  pdf: {
    merxUrl: env.MERX_PDF_URL,
  },
} as const;

export type Config = typeof config;