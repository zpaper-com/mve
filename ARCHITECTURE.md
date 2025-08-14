# AWS React Application Architecture Specification

## Core Architecture Overview

**Frontend:** React SPA hosted on CloudFront with multiple origins  
**Backend:** Node.js/Express API running on ECS Fargate with WebSocket support  
**Document Workflow:** PDF-based enrollment forms with role-based access  
**Database:** RDS PostgreSQL (Single AZ for MVP)  
**Authentication:** Auth0 with social providers and Redis-backed sessions  
**File Storage:** S3 with versioning for PDFs and static assets  
**Secrets:** AWS Secrets Manager with automatic rotation  
**Infrastructure:** AWS CDK with TypeScript

## AWS Services Selection

### Frontend & Content Delivery
- **S3** - Static website hosting for React build artifacts and PDF storage with versioning
- **CloudFront** - Single distribution with multiple origins and path-based routing
- **Route 53** - DNS management for mve.zpaper.com
- **Certificate Manager** - Single SSL/TLS certificate for *.zpaper.com

### Backend Compute & Networking
- **ECS Fargate** - Containerized Node.js/Express application with WebSocket support
- **Application Load Balancer** - Traffic distribution, health checks, and WebSocket upgrades
- **VPC** - Private networking with public/private subnets
- **NAT Gateway** - Outbound internet access for private subnets
- **ECR** - Container registry for Docker images

### Data & State Management
- **RDS PostgreSQL** - Primary database with Single AZ deployment (MVP configuration)
- **ElastiCache Redis** - Session storage and caching
- **Secrets Manager** - Credential storage with automatic rotation

### Security & Access
- **IAM** - Role-based access control for all services
- **Security Groups** - Network-level access control
- **KMS** - Encryption key management for secrets

### Monitoring & Operations
- **CloudWatch** - Logging, metrics, and alerting (focus on ECS health)
- **AWS X-Ray** - Distributed tracing for performance monitoring
- **CloudTrail** - API audit logging and security compliance

## Domain Architecture

### Single Domain Strategy
- **Primary Domain:** `mve.zpaper.com`
- **DNS Management:** Route 53 hosted zone for zpaper.com
- **SSL Certificate:** Wildcard certificate (*.zpaper.com) via Certificate Manager

### CloudFront Path-Based Routing
```
mve.zpaper.com/                     → React App (S3 origin)
mve.zpaper.com/documents/{uuid}/    → Document Workflow (ALB origin) 
mve.zpaper.com/documents/*/assets/  → Static PDF Assets (S3 origin)
mve.zpaper.com/api/                 → Backend API (ALB origin)
```

### CloudFront Behavior Configuration
- **Default Behavior (/):** S3 origin for React SPA with long TTL
- **Documents Behavior (/documents/*):** ALB origin with short/no TTL for dynamic content
- **Assets Behavior (/documents/*/assets/*):** S3 origin with long TTL for static files
- **API Behavior (/api/*):** ALB origin with no caching for API responses

## Document Workflow Architecture

### PDF Document Sessions
- **URL Pattern:** `mve.zpaper.com/documents/{32-bit-uuid}/`
- **Session Data:** Document metadata, completion status, user roles stored in PostgreSQL
- **Access Control:** Role-based permissions (patient, provider, admin) via Auth0
- **PDF Storage:** Static PDF templates and user-generated content in S3 with versioning

### User-Defined PDF Naming
- **File Structure:** User-defined names with UUID-based access control
- **S3 Organization:** Logical grouping by document type and user sessions
- **Version Control:** S3 versioning enabled for audit trail and recovery

## Key Architecture Decisions
### ECS Configuration
- **Launch Type:** Fargate (managed, serverless containers)
- **Service Auto Scaling:** Target tracking based on CPU/memory
- **Task Definition:** Single container with health checks and WebSocket support
- **Networking:** awsvpc mode with ENI per task
- **Container Registry:** ECR for Docker image storage

### Database Setup
- **Engine:** PostgreSQL (latest compatible version)
- **Deployment:** Single AZ for MVP (cost optimization)
- **Storage:** gp3 with automated scaling
- **Backups:** 7-day retention with point-in-time recovery
- **Secrets:** Automatic password rotation every 30 days
- **Upgrade Path:** Easy conversion to Multi-AZ for production

### Authentication Flow
- **Auth0 Integration:** OIDC/OAuth2 with social providers (Google, Facebook, GitHub, Apple)
- **User Metadata:** Custom fields for mobile numbers and NPI (National Provider Identifier)
- **Role Management:** Patient, Provider, and Admin roles for document access
- **Session Management:** Redis-backed sessions with TTL
- **Token Strategy:** JWT access tokens with refresh tokens
- **Security:** Secure HTTP-only cookies for session IDs

### Secrets Management
- **RDS Credentials:** Auto-rotating master and application users
- **Auth0 Secrets:** Client credentials and management API tokens
- **Redis AUTH:** Authentication token for ElastiCache
- **Custom Secrets:** JWT signing keys and third-party API keys

### Content Delivery Strategy
- **Single CloudFront Distribution:** Multiple origins with path-based routing
- **React App Caching:** Long TTL for static assets, short TTL for index.html
- **Document Workflow:** Short/no TTL for dynamic content, long TTL for static PDF assets
- **Compression:** Gzip/Brotli compression enabled
- **Security Headers:** HTTPS redirect, HSTS, CSP headers
- **Geographic Distribution:** Global edge locations

## Development & CI/CD Strategy

### Development Environment
- **Local Development:** Direct Node.js development (no Docker required)
- **Environment Parity:** Matching Node.js versions between local and ECS
- **Secrets Management:** Local environment variables mocking Secrets Manager
- **API Documentation:** Swagger/OpenAPI with swagger-jsdoc and swagger-ui-express

### CI/CD Pipeline (GitHub Actions)
- **Trigger:** Push to main branch
- **Pipeline Stages:**
  1. **Test:** Run unit and integration tests
  2. **Build:** Create production React build and Docker image
  3. **Push:** Upload Docker image to ECR
  4. **Deploy:** Update ECS service with new task definition
- **Environment Secrets:** AWS credentials stored in GitHub Secrets
- **Rollback:** CloudFormation rollback capabilities for failed deployments

### Infrastructure Deployment
- **CDK TypeScript:** Infrastructure as code with environment-specific configurations
- **Stack Organization:** Separate stacks for networking, compute, and data layers
- **Testing:** CDK construct unit tests and snapshot testing
- **Environment Promotion:** Automated promotion from development to production

## Monitoring & Observability

### AWS X-Ray Integration
- **Distributed Tracing:** Track requests across ECS → RDS → Redis → Auth0
- **Performance Analysis:** Identify bottlenecks in database queries and external API calls
- **Error Correlation:** Root cause analysis for failures across service boundaries
- **Service Map:** Visual representation of architecture dependencies
- **Express.js Integration:** X-Ray middleware for automatic instrumentation

### CloudTrail Configuration
- **Security Auditing:** Track all AWS API calls and resource access
- **Compliance:** Required for SOC2, ISO certifications, and security frameworks
- **Incident Response:** Forensic analysis capabilities for security events
- **Cost Analysis:** Understand service usage patterns and optimization opportunities
- **Infrastructure Changes:** Audit trail for all CDK deployments and manual changes

### CloudWatch Monitoring
- **Key Metrics:** ECS task health, ALB response times, RDS connections, Redis memory usage
- **Log Aggregation:** Centralized logging from ECS tasks with structured JSON logs
- **Alerting Strategy:** SNS notifications for critical health issues and threshold breaches
- **Dashboard:** Basic operational dashboard for MVP, enhanced dashboards for production

### Network Security
- **Private subnets** for ECS tasks and databases
- **Security groups** with least-privilege access
- **VPC endpoints** for AWS service communication
- **WAF protection** on CloudFront (optional)

### Data Protection
- **Encryption at rest** for RDS, Redis, and S3
- **Encryption in transit** for all communications
- **Secrets rotation** automated for all credentials
- **Database access** through IAM database authentication

### Application Security
- **CORS configuration** for API endpoints
- **Rate limiting** on ALB and application level
- **Input validation** and SQL injection protection
- **Session security** with secure cookies and CSRF protection

## MVP Configuration

### Cost Optimization for MVP
- **Single AZ RDS:** ~50% cost savings compared to Multi-AZ
- **Smaller Instance Sizes:** db.t3.micro/small for RDS, cache.t3.micro for Redis
- **Basic Monitoring:** Standard CloudWatch without custom dashboards
- **Simplified Backup:** 7-day retention for RDS snapshots
- **Essential Alerts:** ECS health, RDS connection count, high error rates

### Production Upgrade Path
- **Multi-AZ RDS:** One-click enable for high availability
- **Read Replicas:** Add when read traffic becomes significant
- **Enhanced Monitoring:** RDS Performance Insights and custom metrics
- **WAF Protection:** Add security layer to CloudFront
- **Advanced Scaling:** Predictive scaling and spot instances for development

## Cost Optimization

### Resource Sizing
- **Right-sizing** based on actual usage metrics
- **Auto Scaling** to handle traffic variations
- **Reserved Instances** for predictable workloads (future)
- **Spot Instances** for development environments (optional)

### Monitoring & Alerts
- **Cost budgets** with threshold alerts
- **Resource utilization** tracking
- **Unused resource** identification
- **Monthly cost** reporting and optimization reviews
