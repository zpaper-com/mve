# MVE Infrastructure Configuration Summary

## AWS Resources Overview

### Resource Naming Convention
All resources follow the pattern: `mve-<resource-type>-<identifier>`

### Cost Estimation (Monthly)

| Service | Configuration | Estimated Cost |
|---------|--------------|----------------|
| **VPC & Networking** | NAT Gateway (1x) | $45 |
| **RDS PostgreSQL** | t3.small, Single AZ, 20GB | $35 |
| **ElastiCache Redis** | cache.t3.micro, 1 node | $13 |
| **ECS Fargate** | 1 vCPU, 2GB RAM (2 tasks avg) | $60 |
| **Application Load Balancer** | 1 ALB | $25 |
| **S3 Storage** | 100GB total | $3 |
| **CloudFront** | 1TB transfer | $85 |
| **Data Transfer** | Inter-AZ, NAT | $20 |
| **Total Estimated** | | **~$286/month** |

*Note: Costs are estimates for us-east-1 region. Actual costs may vary based on usage.*

## Infrastructure Components

### 1. Networking Configuration

```yaml
VPC:
  CIDR: 10.0.0.0/16
  Availability Zones: 2
  NAT Gateways: 1
  
Subnets:
  Public: 
    - 10.0.0.0/24 (AZ1)
    - 10.0.1.0/24 (AZ2)
  Private:
    - 10.0.2.0/24 (AZ1)
    - 10.0.3.0/24 (AZ2)
  Database:
    - 10.0.4.0/24 (AZ1)
    - 10.0.5.0/24 (AZ2)

Security Groups:
  ALB: 
    - Inbound: 80, 443 from 0.0.0.0/0
  ECS:
    - Inbound: 3000 from ALB SG
  Database:
    - Inbound: 5432 from ECS SG
  Redis:
    - Inbound: 6379 from ECS SG
```

### 2. Database Configuration

```yaml
RDS PostgreSQL:
  Engine: PostgreSQL 15.6
  Instance: t3.small
  Storage: 20GB GP3
  Multi-AZ: false
  Backup: 7 days retention
  Performance Insights: Enabled
  Monitoring: 60 second intervals
  
ElastiCache Redis:
  Engine: Redis 7.0
  Node Type: cache.t3.micro
  Nodes: 1
  Encryption: At-rest and in-transit
  Eviction Policy: allkeys-lru
```

### 3. Container Configuration

```yaml
ECS Cluster:
  Type: Fargate
  Platform Version: Latest
  
Task Definition:
  CPU: 1024 (1 vCPU)
  Memory: 2048 MB
  Network Mode: awsvpc
  
Service:
  Desired Count: 2
  Min Tasks: 1
  Max Tasks: 10
  
Auto-scaling:
  CPU Target: 70%
  Memory Target: 80%
  Request Target: 1000 req/task
```

### 4. Storage Configuration

```yaml
S3 Buckets:
  Static Assets:
    Versioning: Enabled
    Lifecycle: Delete old versions after 30 days
    
  Documents:
    Versioning: Enabled
    Lifecycle: Archive to Glacier after 30 days
    CORS: Enabled for presigned URLs
    
  Attachments:
    Versioning: Disabled
    Lifecycle: Delete after 90 days
    CORS: Enabled for presigned URLs
    Max File Size: 25MB
```

### 5. CDN Configuration

```yaml
CloudFront:
  Price Class: PriceClass_100 (US, Canada, Europe)
  Origins:
    - S3 Static Assets (default)
    - ALB (for /api/*)
  Caching:
    Static: 1-365 days
    Dynamic: 0-1 second
  Security:
    - HTTPS only
    - Security headers enabled
  Error Pages:
    404, 403 -> index.html (SPA routing)
```

## IAM Roles and Policies

### ECS Task Execution Role
```json
{
  "Policies": [
    "AmazonECSTaskExecutionRolePolicy",
    "ECR:GetAuthorizationToken",
    "ECR:BatchCheckLayerAvailability",
    "ECR:GetDownloadUrlForLayer",
    "ECR:BatchGetImage",
    "SecretsManager:GetSecretValue"
  ]
}
```

### ECS Task Role
```json
{
  "Policies": [
    "S3:GetObject,PutObject,DeleteObject (all buckets)",
    "SecretsManager:GetSecretValue,DescribeSecret",
    "CloudFront:CreateInvalidation",
    "CloudWatch:PutMetricData"
  ]
}
```

## Environment Variables

### Required for Backend
```bash
# Core
NODE_ENV=production
PORT=3000
AWS_REGION=us-east-1

# Database
DATABASE_HOST=<rds-endpoint>
DATABASE_NAME=mve_database
DATABASE_USER=mve_admin
DATABASE_PASSWORD=<from-secrets-manager>

# Redis
REDIS_HOST=<elasticache-endpoint>
REDIS_PORT=6379
REDIS_TLS=true

# S3
S3_STATIC_BUCKET=mve-static-<account>-<region>
S3_DOCUMENTS_BUCKET=mve-documents-<account>-<region>
S3_ATTACHMENTS_BUCKET=mve-attachments-<account>-<region>

# CloudFront
CLOUDFRONT_DISTRIBUTION_ID=<distribution-id>
CLOUDFRONT_DOMAIN=<distribution-domain>
```

### Required for Frontend
```javascript
// vite.config.ts environment variables
VITE_API_URL=https://<cloudfront-domain>/api
VITE_AUTH0_DOMAIN=<auth0-domain>
VITE_AUTH0_CLIENT_ID=<client-id>
VITE_AUTH0_AUDIENCE=<api-audience>
```

## Monitoring & Alarms

### CloudWatch Alarms
- **mve-high-cpu**: CPU > 80% for 2 periods
- **mve-high-memory**: Memory > 85% for 2 periods
- **mve-unhealthy-targets**: Unhealthy targets > 0
- **mve-database-cpu**: RDS CPU > 80%
- **mve-database-storage**: Free storage < 1GB

### Log Groups
- `/ecs/mve-backend`: Application logs
- `/aws/rds/instance/mve-postgresql/postgresql`: Database logs
- `/aws/elasticache/mve-redis`: Redis logs

## Backup Strategy

### RDS Backups
- Automated daily backups
- 7-day retention period
- Point-in-time recovery enabled
- Manual snapshots before major changes

### S3 Versioning
- Static bucket: Versioning enabled
- Documents bucket: Versioning enabled
- Attachments bucket: Versioning disabled

## Disaster Recovery

### RPO (Recovery Point Objective)
- Database: 24 hours (daily backup)
- S3 Data: Near zero (versioning)
- Redis Cache: N/A (ephemeral)

### RTO (Recovery Time Objective)
- Full stack recovery: 2-4 hours
- Database restore: 30-60 minutes
- ECS service recovery: 5-10 minutes

## Security Checklist

- [x] Encryption at rest (RDS, S3, ElastiCache)
- [x] Encryption in transit (TLS/HTTPS)
- [x] Private subnets for compute and data
- [x] Security groups with least privilege
- [x] VPC endpoints for AWS services
- [x] Secrets in AWS Secrets Manager
- [x] CloudFront security headers
- [x] S3 bucket policies (no public access)
- [ ] AWS WAF (Phase 2)
- [ ] GuardDuty (Phase 2)
- [ ] AWS Shield (Phase 2)

## Optimization Opportunities

### Phase 1 (MVP)
- Single NAT Gateway (cost optimization)
- Single AZ RDS (cost optimization)
- t3 instance types (burstable)
- On-demand pricing

### Phase 2 Improvements
- Multi-AZ RDS for HA
- Reserved Instances (1-year)
- Fargate Spot for dev/test
- S3 Intelligent-Tiering
- CloudFront custom domain
- AWS WAF integration
- Multiple environments (dev/staging/prod)