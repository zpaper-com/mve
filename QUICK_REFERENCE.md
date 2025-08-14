# MVE Infrastructure Quick Reference

## 🚀 Rapid Deployment Commands

```bash
# Full deployment (20-30 minutes)
./deploy-infrastructure.sh --deploy

# Check prerequisites only
./deploy-infrastructure.sh --check

# Get outputs after deployment
./deploy-infrastructure.sh --outputs
```

## 📦 Stack Dependencies

```
MveNetworkingStack (VPC, Security Groups)
    ↓
MveDataStack (RDS, Redis)
    ↓
MveStorageStack (S3, CloudFront)
    ↓
MveComputeStack (ECS, ALB, ECR)
```

## 🔑 Key Resources Created

| Resource | Name Pattern | Purpose |
|----------|-------------|---------|
| VPC | mve-vpc | Network isolation |
| RDS | mve-postgresql | Database |
| Redis | mve-redis | Session cache |
| ECS Cluster | mve-cluster | Container orchestration |
| ALB | mve-alb | Load balancing |
| ECR | mve-backend | Container registry |
| S3 Static | mve-static-* | React app |
| S3 Docs | mve-documents-* | PDF storage |
| S3 Attachments | mve-attachments-* | User uploads |
| CloudFront | mve-distribution | CDN |

## 🔧 Common Operations

### Deploy Backend Update
```bash
# Build and push new image
docker build -t mve-backend .
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
docker tag mve-backend:latest $ECR_URI:latest
docker push $ECR_URI:latest

# Force service update
aws ecs update-service --cluster mve-cluster --service mve-backend-service --force-new-deployment
```

### Deploy Frontend Update
```bash
cd frontend
npm run build
aws s3 sync dist/ s3://mve-static-$ACCOUNT-$REGION/ --delete
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
```

### View Logs
```bash
# Application logs
aws logs tail /ecs/mve-backend --follow

# Recent errors
aws logs filter-log-events --log-group-name /ecs/mve-backend --filter-pattern ERROR --start-time $(date -u -d '1 hour ago' +%s)000
```

### Database Access
```bash
# Get password from Secrets Manager
aws secretsmanager get-secret-value --secret-id mve/database/credentials --query SecretString --output text | jq -r .password

# Connect via psql
psql -h <RDS_ENDPOINT> -U mve_admin -d mve_database
```

### Scale ECS Service
```bash
# Scale up
aws ecs update-service --cluster mve-cluster --service mve-backend-service --desired-count 5

# Scale down
aws ecs update-service --cluster mve-cluster --service mve-backend-service --desired-count 1
```

## 📊 Monitoring URLs

| Service | URL/Command |
|---------|-------------|
| CloudWatch Logs | `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups` |
| ECS Console | `https://console.aws.amazon.com/ecs/home?region=us-east-1#/clusters/mve-cluster` |
| RDS Console | `https://console.aws.amazon.com/rds/home?region=us-east-1#databases:` |
| CloudFront | `https://console.aws.amazon.com/cloudfront/home` |
| S3 Buckets | `https://s3.console.aws.amazon.com/s3/home?region=us-east-1` |

## 🔍 Health Checks

```bash
# ALB health
curl -f http://$ALB_DNS/health || echo "Unhealthy"

# Database connectivity
aws rds describe-db-instances --db-instance-identifier mve-postgresql --query 'DBInstances[0].DBInstanceStatus'

# Redis connectivity
aws elasticache describe-cache-clusters --cache-cluster-id mve-redis --query 'CacheClusters[0].CacheClusterStatus'

# ECS service status
aws ecs describe-services --cluster mve-cluster --services mve-backend-service --query 'services[0].runningCount'
```

## 💰 Cost Monitoring

```bash
# Get current month costs
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d "$(date +%Y-%m-01)" +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE
```

## 🛑 Emergency Procedures

### Stop All Services (Cost Saving)
```bash
# Stop RDS
aws rds stop-db-instance --db-instance-identifier mve-postgresql

# Scale ECS to 0
aws ecs update-service --cluster mve-cluster --service mve-backend-service --desired-count 0
```

### Restart Services
```bash
# Start RDS
aws rds start-db-instance --db-instance-identifier mve-postgresql

# Scale ECS back up
aws ecs update-service --cluster mve-cluster --service mve-backend-service --desired-count 2
```

### Emergency Rollback
```bash
# Deploy previous task definition
aws ecs update-service --cluster mve-cluster --service mve-backend-service --task-definition mve-backend-task:<PREVIOUS_REVISION>
```

## 📝 Environment Variables Quick Setup

```bash
# Get database password
export DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id mve/database/credentials --query SecretString --output text | jq -r .password)

# Get all endpoints
export ALB_DNS=$(aws cloudformation describe-stacks --stack-name MveComputeStack --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDnsName'].OutputValue" --output text)
export CF_DOMAIN=$(aws cloudformation describe-stacks --stack-name MveStorageStack --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" --output text)
export DB_HOST=$(aws cloudformation describe-stacks --stack-name MveDataStack --query "Stacks[0].Outputs[?OutputKey=='DatabaseEndpoint'].OutputValue" --output text)
export REDIS_HOST=$(aws cloudformation describe-stacks --stack-name MveDataStack --query "Stacks[0].Outputs[?OutputKey=='RedisEndpoint'].OutputValue" --output text)
```

## 🗑️ Cleanup Commands

```bash
# Empty S3 buckets (required before destroy)
aws s3 rm s3://mve-static-$ACCOUNT-$REGION --recursive
aws s3 rm s3://mve-documents-$ACCOUNT-$REGION --recursive
aws s3 rm s3://mve-attachments-$ACCOUNT-$REGION --recursive

# Destroy infrastructure
./deploy-infrastructure.sh --destroy
```

## 📞 Support Contacts

- AWS Support: https://console.aws.amazon.com/support/
- CDK Issues: https://github.com/aws/aws-cdk/issues
- Documentation: https://docs.aws.amazon.com/cdk/v2/guide/