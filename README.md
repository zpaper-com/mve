# MVE Backend - PDF Workflow Management System

A scalable Express.js backend service for managing PDF workflows with sequential form completion by multiple parties.

## Features

- **PDF Processing**: Serves Merx PDF with hidden signature fields using PDF.js
- **Workflow Management**: Sequential workflow system with unique URLs for each recipient
- **Attachment System**: File upload support with S3 integration
- **Real-time Updates**: WebSocket support for real-time workflow updates
- **Authentication**: JWT-based authentication with Auth0 integration ready
- **Caching**: Redis-based session storage and caching
- **Security**: Rate limiting, CORS, input validation, and security headers
- **Monitoring**: Structured logging with Winston and comprehensive health checks

## Technology Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js with Socket.io for WebSockets
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis for sessions and caching
- **Storage**: AWS S3 for file attachments
- **Email**: SendGrid for notifications
- **Security**: Helmet, CORS, express-rate-limit
- **Deployment**: Docker with ECS support

## API Endpoints

### PDF Endpoints
- `GET /api/pdf/merx` - Serve Merx PDF with hidden signature fields
- `POST /api/pdf/:sessionId/form-data` - Save form field data
- `GET /api/pdf/:sessionId/download` - Download filled PDF

### Workflow Endpoints
- `POST /api/workflow/create` - Create new workflow session
- `GET /api/workflow/:uniqueUrl` - Get workflow by unique URL
- `POST /api/workflow/:uniqueUrl/submit` - Submit workflow step

### Attachment Endpoints
- `POST /api/attachments/:sessionId/upload` - Upload attachments
- `GET /api/attachments/:sessionId` - List session attachments
- `GET /api/attachments/:attachmentId/download` - Download attachment

### Health Endpoints
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed health with dependencies
- `GET /api/health/ready` - Readiness probe for orchestrators
- `GET /api/health/live` - Liveness probe for orchestrators

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- AWS account (for S3) or LocalStack for development

### Installation

1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database setup**:
   ```bash
   # Generate Prisma client
   npm run db:generate
   
   # Run migrations
   npm run db:migrate
   
   # Seed database (optional)
   npm run db:seed
   ```

4. **Development server**:
   ```bash
   npm run dev
   ```

### Docker Development

1. **Start all services**:
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
   ```

2. **Run database migrations**:
   ```bash
   docker-compose exec mve-backend npm run db:migrate
   ```

3. **View logs**:
   ```bash
   docker-compose logs -f mve-backend
   ```

### Production Deployment

1. **Build production image**:
   ```bash
   docker build -t mve-backend:latest .
   ```

2. **Deploy to ECS** (requires AWS configuration):
   ```bash
   # Push to ECR
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
   docker tag mve-backend:latest <account>.dkr.ecr.us-east-1.amazonaws.com/mve-backend:latest
   docker push <account>.dkr.ecr.us-east-1.amazonaws.com/mve-backend:latest
   ```

## Configuration

### Environment Variables

Required environment variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mve_database

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters
SESSION_SECRET=your-super-secure-session-secret-minimum-32-characters

# AWS (for S3 file storage)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_DOCUMENTS=mve-zpaper-documents
S3_BUCKET_ATTACHMENTS=mve-zpaper-attachments

# Email (SendGrid)
SENDGRID_API_KEY=your-sendgrid-api-key
EMAIL_FROM=noreply@zpaper.com

# CORS
CORS_ORIGINS=https://mve.zpaper.com,http://localhost:3000
```

### Auth0 Configuration (Optional)

For Auth0 integration:

```env
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=your-api-identifier
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

## Database Schema

### WorkflowSession
- `id` (UUID) - Primary key
- `documentUrl` (String) - PDF document URL
- `status` (Enum) - active, completed, cancelled, expired
- `metadata` (JSON) - Additional workflow data
- `createdAt`, `updatedAt` (DateTime)

### Recipient
- `id` (UUID) - Primary key
- `sessionId` (UUID) - Foreign key to WorkflowSession
- `orderIndex` (Integer) - Order in workflow sequence
- `recipientType` (Enum) - prescriber, patient, pharmacy, insurance, custom
- `partyName`, `email`, `mobile`, `npi` (Optional strings)
- `uniqueUrl` (String) - Unique access URL
- `status` (Enum) - pending, notified, accessed, completed, expired
- `formData` (JSON) - Form field values
- `accessedAt`, `completedAt` (DateTime)

### Attachment
- `id` (UUID) - Primary key
- `sessionId` (UUID) - Foreign key to WorkflowSession
- `fileName`, `fileType` (String) - File metadata
- `fileSize` (Integer) - File size in bytes
- `s3Key` (String) - S3 storage key
- `uploadedAt` (DateTime)

## Development

### Scripts

```bash
# Development
npm run dev          # Start with hot reload
npm run build        # Build for production
npm run start        # Start production build

# Database
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema changes
npm run db:migrate   # Run migrations
npm run db:seed      # Seed database

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
```

### Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # HTTP request handlers
├── middleware/      # Express middleware
├── routes/          # API route definitions
├── services/        # Business logic services
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
├── prisma/          # Database schema and migrations
└── server.ts        # Main application entry point
```

## Security

- **Authentication**: JWT tokens with configurable Auth0 integration
- **Authorization**: Role-based access control ready
- **Rate Limiting**: 100 requests per minute per IP by default
- **Input Validation**: Comprehensive request validation with express-validator
- **Security Headers**: Helmet.js for security headers
- **CORS**: Configurable CORS policy
- **File Upload**: Type and size validation for file uploads
- **Session Security**: Secure session cookies with Redis storage

## Monitoring & Logging

- **Structured Logging**: Winston with JSON format
- **Request Logging**: Automatic HTTP request/response logging
- **Health Checks**: Multiple health check endpoints for monitoring
- **Error Tracking**: Comprehensive error handling and logging
- **Performance**: Request duration and system metrics

## API Documentation

The API follows RESTful conventions with consistent response formats:

```typescript
// Success Response
{
  success: true,
  data: { /* response data */ },
  message: "Operation completed successfully",
  timestamp: "2024-01-01T00:00:00.000Z"
}

// Error Response
{
  success: false,
  message: "Error description",
  errors: ["detailed error messages"],
  timestamp: "2024-01-01T00:00:00.000Z",
  path: "/api/endpoint",
  method: "POST",
  statusCode: 400
}
```

## WebSocket Events

Real-time updates via WebSocket:

- `workflow:updated` - Workflow status changes
- `form:updated` - Form data updates
- `attachment:uploaded` - New attachment notifications

## Deployment

### ECS Deployment

The application is designed for AWS ECS Fargate deployment:

1. **Container**: Multi-stage Docker build optimized for production
2. **Health Checks**: Built-in health check endpoints
3. **Logging**: Structured JSON logs for CloudWatch
4. **Environment**: 12-factor app configuration
5. **Security**: Non-root user, minimal attack surface

### Environment Setup

For production deployment, ensure:

- RDS PostgreSQL instance with proper security groups
- ElastiCache Redis cluster for session storage
- S3 buckets for file storage with proper IAM policies
- ALB for load balancing and SSL termination
- CloudWatch for monitoring and log aggregation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run linting and tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For questions or issues, please create an issue in the repository or contact the development team.