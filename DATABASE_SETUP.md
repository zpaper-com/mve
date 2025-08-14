# MVE Database Setup - Complete Implementation

## Overview

This document outlines the complete database setup for the MVE (PDF workflow) project using Prisma ORM with PostgreSQL. The implementation is optimized for rapid deployment while maintaining data integrity and performance.

## Database Schema

### Core Tables

#### 1. workflow_sessions
Main workflow tracking table with performance optimizations:
- **id**: UUID primary key
- **document_url**: S3 URL to the PDF (max 500 chars)
- **status**: Enum (ACTIVE, COMPLETED, CANCELLED, EXPIRED)
- **created_at/updated_at**: Automatic timestamps
- **expires_at**: 48-hour timeout (configurable)
- **metadata**: JSONB for additional workflow data
- **creator_id**: Auth0 user ID
- **current_recipient_order**: Track workflow progress
- **total_recipients/completed_recipients**: Progress counters

#### 2. recipients
Sequential workflow participants with comprehensive status tracking:
- **id**: UUID primary key
- **session_id**: Foreign key to workflow_sessions
- **order_index**: Sequential workflow position (0-based)
- **unique_url**: Base32 UUID for secure access (most critical index)
- **status**: Enum (PENDING, ACCESSED, IN_PROGRESS, COMPLETED, FAILED, EXPIRED)
- **recipient_type**: Enum (PRESCRIBER, PATIENT, PHARMACY, INSURANCE, CUSTOM)
- **form_data**: JSONB for form field values
- **notification tracking**: email_sent_at, sms_sent_at, reminder_count
- **error tracking**: error_message, retry_count

#### 3. attachments
File attachments with S3 metadata and access tracking:
- **id**: UUID primary key
- **session_id**: Foreign key to workflow_sessions
- **recipient_id**: Optional - who uploaded it
- **file_name/file_type/file_size**: File metadata
- **s3_key/s3_bucket**: S3 storage location
- **checksum**: SHA-256 for integrity
- **scan_status**: Virus scan result
- **download_count/last_download**: Access tracking

#### 4. workflow_audit_logs
Comprehensive audit trail for all workflow events:
- **id**: UUID primary key
- **session_id/recipient_id**: Event context
- **event_type**: Event classification
- **event_data**: JSONB for event details
- **ip_address**: Client IP (INET type)
- **user_agent**: Browser information
- **created_at**: Event timestamp

## Performance Optimizations

### Critical Indexes
1. **idx_recipient_unique_url** - Most important for URL lookups
2. **idx_workflow_status_created** - Workflow filtering and sorting
3. **idx_recipient_status_session** - Recipient status queries
4. **idx_attachment_session_uploaded** - Attachment queries

### Database Functions
1. **update_updated_at_column()** - Automatic timestamp updates
2. **update_workflow_progress()** - Auto-update progress counters
3. **generate_unique_recipient_url()** - Secure URL generation

### Query Optimizations
- JSONB indexes on metadata and form_data
- Composite indexes for common query patterns
- Partial indexes for nullable fields
- Constraint validation for data integrity

## Database Commands

### Setup Commands
```bash
# Complete database setup with seeding
npm run db:setup

# Force reset and setup (destructive)
npm run db:setup:force

# Verify database setup without changes
npm run db:verify

# Test database connectivity and performance
npm run db:test

# Basic Prisma commands
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:seed        # Seed sample data
npm run db:push        # Push schema changes
npm run db:reset       # Reset database (destructive)
```

### Migration Commands
```bash
# Create new migration
npx prisma migrate dev --name <migration_name>

# Deploy migrations to production
npx prisma migrate deploy

# Check migration status
npx prisma migrate status

# Reset migrations (destructive)
npx prisma migrate reset
```

## Environment Configuration

### Required Environment Variables
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mve_db"
DIRECT_DATABASE_URL="postgresql://user:password@localhost:5432/mve_db"

# Application
NODE_ENV="development"
JWT_SECRET="your-jwt-secret-minimum-32-chars"
SESSION_SECRET="your-session-secret-minimum-32-chars"

# AWS S3
AWS_REGION="us-east-1"
S3_BUCKET_DOCUMENTS="mve-zpaper-documents"
S3_BUCKET_ATTACHMENTS="mve-zpaper-attachments"
S3_BUCKET_STATIC="mve-zpaper-static"

# Redis
REDIS_URL="redis://localhost:6379"

# Optional
AUTH0_DOMAIN="your-auth0-domain.auth0.com"
SENDGRID_API_KEY="your-sendgrid-api-key"
```

## Utility Functions

### DatabaseUtils Class
Comprehensive database operations with transaction support:

```typescript
// Create workflow with recipients
await DatabaseUtils.createWorkflowSession({
  documentUrl: 'https://s3.../document.pdf',
  recipients: [
    { recipientType: 'PRESCRIBER', email: 'dr@example.com' },
    { recipientType: 'PATIENT', email: 'patient@example.com' }
  ]
});

// Get workflow with relations
const workflow = await DatabaseUtils.getWorkflowSession(sessionId);

// Update recipient progress
await DatabaseUtils.updateRecipientProgress(recipientId, {
  status: 'COMPLETED',
  formData: { signature: 'Dr. Smith' }
});

// Get performance statistics
const stats = await DatabaseUtils.getWorkflowStats();

// Clean up expired workflows
await DatabaseUtils.cleanupExpiredWorkflows();
```

### Schema Validation
Type-safe validation using Zod schemas:

```typescript
import { CreateWorkflowSessionSchema, validateFormData } from './utils/schema-validation';

// Validate workflow creation
const validatedData = CreateWorkflowSessionSchema.parse(requestData);

// Validate form data based on recipient type
const validatedForm = validateFormData('PRESCRIBER', formData);
```

### Migration Helper
Database migration and health monitoring:

```typescript
import { MigrationHelper } from './utils/migration-helper';

const migrationHelper = new MigrationHelper(prisma);

// Verify database setup
const verification = await migrationHelper.verifyDatabaseSetup();

// Get performance metrics
const metrics = await migrationHelper.getPerformanceMetrics();

// Run integrity checks
const integrity = await validateDatabaseIntegrity(prisma);
```

## File Structure

```
/
├── prisma/
│   ├── schema.prisma              # Main Prisma schema
│   ├── seed.ts                    # Sample data seeding
│   └── migrations/                # Database migrations
│       └── 001_initial_schema_optimized.sql
├── src/
│   ├── config/
│   │   ├── database.ts           # Prisma client configuration
│   │   ├── env.ts               # Environment validation
│   │   └── logger.ts            # Database logging
│   ├── utils/
│   │   ├── database.ts          # Database utility functions
│   │   ├── schema-validation.ts # Validation schemas
│   │   └── migration-helper.ts  # Migration utilities
│   └── types/
│       └── index.ts             # TypeScript type definitions
└── scripts/
    ├── setup-database.ts        # Complete database setup
    └── test-database.ts         # Database testing
```

## Performance Considerations

### Query Performance
- All critical paths use proper indexes
- Recipient URL lookup: <5ms (most critical)
- Workflow listing: <50ms
- Form data queries: <100ms using JSONB indexes

### Connection Management
- Prisma connection pooling configured
- Connection limits set for production
- Health checks monitor connection count
- Automatic reconnection on failures

### Data Integrity
- Foreign key constraints ensure referential integrity
- Check constraints prevent invalid data
- Triggers maintain progress counters automatically
- Audit logs track all changes

## Security Features

### Data Protection
- UUIDs prevent enumeration attacks
- Unique URLs use Base32 encoding for readability
- JSONB fields sanitized and validated
- File checksums prevent tampering

### Access Control
- Row-level security through application logic
- Audit logging for compliance
- IP address tracking for security
- Error message sanitization

## Monitoring and Maintenance

### Health Checks
```bash
# Test database connectivity
npm run db:test

# Check performance metrics
curl /api/health/database

# Verify schema integrity
npm run db:verify
```

### Maintenance Tasks
- **Daily**: Monitor slow queries and connection counts
- **Weekly**: Update table statistics with ANALYZE
- **Monthly**: Review audit logs and clean up expired data
- **Quarterly**: Index usage analysis and optimization

## Troubleshooting

### Common Issues

1. **Migration Failures**
   ```bash
   # Check current migration status
   npx prisma migrate status
   
   # Resolve migration conflicts
   npx prisma migrate resolve --rolled-back 001_initial
   ```

2. **Performance Issues**
   ```sql
   -- Check slow queries
   SELECT query, mean_exec_time, calls 
   FROM pg_stat_statements 
   ORDER BY mean_exec_time DESC 
   LIMIT 10;
   
   -- Check index usage
   SELECT schemaname, tablename, indexname, idx_tup_read 
   FROM pg_stat_user_indexes 
   ORDER BY idx_tup_read DESC;
   ```

3. **Connection Issues**
   ```bash
   # Test database connection
   npm run db:test
   
   # Check connection pool
   SELECT count(*) FROM pg_stat_activity;
   ```

## Production Deployment

### Pre-deployment Checklist
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] Performance benchmarks met
- [ ] Backup procedures tested
- [ ] Monitoring alerts configured

### Deployment Steps
1. Run migrations: `npx prisma migrate deploy`
2. Update table statistics: `ANALYZE;`
3. Verify health checks pass
4. Monitor initial traffic patterns
5. Set up automated backups

## API Integration

The database layer integrates with:
- **Controllers**: `/src/controllers/workflowController.ts`
- **Services**: `/src/services/workflowService.ts`
- **Routes**: `/src/routes/workflowRoutes.ts`
- **Middleware**: Authentication and validation

## Conclusion

This database setup provides a robust, scalable foundation for the MVE project with:
- ✅ Complete schema with all required tables and relations
- ✅ Performance-optimized indexes and queries
- ✅ Comprehensive audit logging and monitoring
- ✅ Type-safe validation and error handling
- ✅ Production-ready migration and deployment tools
- ✅ Extensive testing and health check capabilities

The implementation prioritizes rapid deployment while maintaining data integrity and performance for the MVP phase.