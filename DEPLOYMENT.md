# MVE Infrastructure Deployment Guide

## Prerequisites

1. **AWS Account Setup**
   - AWS CLI configured with appropriate credentials
   - IAM user with Administrator access (for initial deployment)
   - AWS Account ID and desired region (us-east-1)

2. **Required Tools**
   ```bash
   # Install Node.js 18+ 
   # Install AWS CLI v2
   # Install Docker for container builds
   ```

3. **Domain Configuration** (Optional for MVP)
   - Access to zpaper.com DNS records
   - Ability to validate ACM certificates

## Quick Start Deployment

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure AWS Environment
```bash
export AWS_ACCOUNT_ID=<your-account-id>
export AWS_REGION=us-east-1
export CDK_DEFAULT_ACCOUNT=$AWS_ACCOUNT_ID
export CDK_DEFAULT_REGION=$AWS_REGION
```

### Step 3: Bootstrap CDK (First time only)
```bash
npm run cdk:bootstrap
```

### Step 4: Deploy Infrastructure

Deploy all stacks in sequence:
```bash
# Deploy all stacks at once
npm run cdk:deploy

# Or deploy individually in order:
npm run cdk:deploy:networking  # VPC, Subnets, Security Groups
npm run cdk:deploy:data        # RDS, ElastiCache
npm run cdk:deploy:storage     # S3, CloudFront
npm run cdk:deploy:compute     # ECS, ALB, ECR
```

## Stack Details

### 1. Networking Stack (`MveNetworkingStack`)
- **VPC**: 10.0.0.0/16 with public/private/isolated subnets
- **NAT Gateway**: Single NAT for cost optimization
- **Security Groups**: ALB, ECS, Database, Redis
- **VPC Endpoints**: S3, ECR, CloudWatch, Secrets Manager

### 2. Data Stack (`MveDataStack`)
- **RDS PostgreSQL**: t3.small, Single AZ, 20GB storage
- **ElastiCache Redis**: cache.t3.micro, single node
- **Secrets Manager**: Database credentials
- **Automated Backups**: 7-day retention

### 3. Storage Stack (`MveStorageStack`)
- **S3 Buckets**: Static assets, Documents, Attachments
- **CloudFront**: Global CDN distribution
- **CORS Configuration**: Configured for presigned URLs

### 4. Compute Stack (`MveComputeStack`)
- **ECS Fargate**: 1 vCPU, 2GB RAM
- **Application Load Balancer**: Internet-facing
- **ECR Repository**: Container registry
- **Auto-scaling**: 1-10 tasks based on CPU/Memory/Requests

## Post-Deployment Configuration

### 1. Build and Push Docker Image
```bash
# Build backend Docker image
docker build -t mve-backend .

# Get ECR login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Tag image
docker tag mve-backend:latest $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/mve-backend:latest

# Push to ECR
docker push $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/mve-backend:latest

# Update ECS service to use new image
aws ecs update-service --cluster mve-cluster --service mve-backend-service --force-new-deployment
```

### 2. Initialize Database
```bash
# Connect to RDS instance via bastion or locally
# Run database migrations
npm run db:migrate

# Seed initial data
npm run db:seed
```

### 3. Deploy Frontend to S3
```bash
# Build frontend
cd frontend
npm run build

# Sync to S3
aws s3 sync dist/ s3://mve-static-$AWS_ACCOUNT_ID-us-east-1/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"
```

### 4. Configure Environment Variables

Create `.env` file for local development:
```env
NODE_ENV=production
PORT=3000
AWS_REGION=us-east-1

# Database
DATABASE_HOST=<RDS_ENDPOINT>
DATABASE_NAME=mve_database
DATABASE_USER=mve_admin
DATABASE_PASSWORD=<FROM_SECRETS_MANAGER>

# Redis
REDIS_HOST=<ELASTICACHE_ENDPOINT>
REDIS_PORT=6379

# S3 Buckets
S3_STATIC_BUCKET=mve-static-<ACCOUNT>-us-east-1
S3_DOCUMENTS_BUCKET=mve-documents-<ACCOUNT>-us-east-1
S3_ATTACHMENTS_BUCKET=mve-attachments-<ACCOUNT>-us-east-1

# CloudFront
CLOUDFRONT_DISTRIBUTION_ID=<DISTRIBUTION_ID>
CLOUDFRONT_DOMAIN=<DISTRIBUTION_DOMAIN>

# Auth0 (when available)
AUTH0_DOMAIN=<your-domain>.auth0.com
AUTH0_CLIENT_ID=<client-id>
AUTH0_CLIENT_SECRET=<client-secret>
AUTH0_AUDIENCE=<api-audience>

# SendGrid
SENDGRID_API_KEY=<api-key>
FROM_EMAIL=noreply@zpaper.com

# Twilio (Phase 2)
TWILIO_ACCOUNT_SID=<account-sid>
TWILIO_AUTH_TOKEN=<auth-token>
TWILIO_PHONE_NUMBER=<phone-number>
```

## Stack Outputs

After deployment, important values are available as CloudFormation outputs:

```bash
# View all outputs
aws cloudformation describe-stacks --region us-east-1 --query "Stacks[].Outputs" --output table

# Get specific outputs
aws cloudformation describe-stacks --stack-name MveNetworkingStack --query "Stacks[0].Outputs"
aws cloudformation describe-stacks --stack-name MveDataStack --query "Stacks[0].Outputs"
aws cloudformation describe-stacks --stack-name MveStorageStack --query "Stacks[0].Outputs"
aws cloudformation describe-stacks --stack-name MveComputeStack --query "Stacks[0].Outputs"
```

## Monitoring & Logs

### CloudWatch Logs
- ECS Tasks: `/ecs/mve-backend`
- RDS: Performance Insights enabled
- CloudFront: Access logs can be enabled

### CloudWatch Alarms
- High CPU utilization (>80%)
- High memory utilization (>85%)
- Unhealthy targets in ALB

### Accessing Logs
```bash
# View ECS logs
aws logs tail /ecs/mve-backend --follow

# View recent errors
aws logs filter-log-events --log-group-name /ecs/mve-backend --filter-pattern ERROR
```

## Cost Optimization Tips

1. **Development Environment**
   - Stop RDS instance when not in use
   - Reduce ECS desired count to 1
   - Use Fargate Spot for non-production

2. **Production Optimization**
   - Enable RDS auto-pause for dev/staging
   - Use Reserved Instances for predictable workloads
   - Enable S3 Intelligent-Tiering

## Troubleshooting

### Common Issues

1. **ECS Tasks Not Starting**
   - Check ECR image exists
   - Verify security groups allow traffic
   - Check CloudWatch logs for errors

2. **Database Connection Issues**
   - Verify security group rules
   - Check Secrets Manager permissions
   - Ensure database is in correct subnet

3. **CloudFront 403/404 Errors**
   - Check S3 bucket permissions
   - Verify Origin Access Identity configuration
   - Ensure index.html exists in bucket

### Useful Commands

```bash
# Check ECS service status
aws ecs describe-services --cluster mve-cluster --services mve-backend-service

# View running tasks
aws ecs list-tasks --cluster mve-cluster --service-name mve-backend-service

# Connect to ECS task (debugging)
aws ecs execute-command --cluster mve-cluster --task <TASK_ID> --container mve-backend --interactive --command "/bin/sh"

# Test ALB health check
curl http://<ALB_DNS>/health
```

## Cleanup

To destroy all resources:
```bash
# Empty S3 buckets first
aws s3 rm s3://mve-static-$AWS_ACCOUNT_ID-us-east-1 --recursive
aws s3 rm s3://mve-documents-$AWS_ACCOUNT_ID-us-east-1 --recursive
aws s3 rm s3://mve-attachments-$AWS_ACCOUNT_ID-us-east-1 --recursive

# Destroy CDK stacks
npm run cdk:destroy
```

## Security Considerations

1. **Secrets Management**
   - Never commit credentials to git
   - Use AWS Secrets Manager for all sensitive data
   - Rotate credentials regularly

2. **Network Security**
   - Review security group rules regularly
   - Enable VPC Flow Logs for audit
   - Use AWS WAF for additional protection

3. **Data Protection**
   - Enable encryption at rest for all services
   - Use HTTPS for all communications
   - Implement backup and recovery procedures

## Next Steps

1. Configure Auth0 integration
2. Set up CI/CD pipeline
3. Implement monitoring dashboards
4. Configure auto-scaling policies
5. Set up multi-environment deployment