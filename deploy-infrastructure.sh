#!/bin/bash

# MVE Infrastructure Deployment Script
# This script automates the deployment of the MVE infrastructure using AWS CDK

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+"
        exit 1
    fi
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install AWS CLI v2"
        exit 1
    fi
    
    # Check CDK
    if ! command -v cdk &> /dev/null; then
        print_warning "CDK CLI not found globally. Will use local version."
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure'"
        exit 1
    fi
    
    print_status "Prerequisites check passed!"
}

# Set environment variables
setup_environment() {
    print_status "Setting up environment variables..."
    
    # Get AWS account ID and region
    export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    export AWS_REGION=${AWS_REGION:-us-east-1}
    export CDK_DEFAULT_ACCOUNT=$AWS_ACCOUNT_ID
    export CDK_DEFAULT_REGION=$AWS_REGION
    
    print_status "AWS Account ID: $AWS_ACCOUNT_ID"
    print_status "AWS Region: $AWS_REGION"
}

# Install dependencies
install_dependencies() {
    print_status "Installing npm dependencies..."
    npm install
}

# Bootstrap CDK
bootstrap_cdk() {
    print_status "Checking CDK bootstrap status..."
    
    # Check if already bootstrapped
    if aws cloudformation describe-stacks --stack-name CDKToolkit --region $AWS_REGION &> /dev/null; then
        print_status "CDK already bootstrapped in $AWS_REGION"
    else
        print_status "Bootstrapping CDK in $AWS_REGION..."
        npx cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION
    fi
}

# Synthesize CDK stacks
synth_stacks() {
    print_status "Synthesizing CDK stacks..."
    npx cdk synth --all
}

# Deploy individual stack
deploy_stack() {
    local stack_name=$1
    print_status "Deploying $stack_name..."
    npx cdk deploy $stack_name --require-approval never
}

# Deploy all stacks
deploy_all_stacks() {
    print_status "Starting infrastructure deployment..."
    
    # Deploy in order of dependencies
    deploy_stack "MveNetworkingStack"
    deploy_stack "MveDataStack"
    deploy_stack "MveStorageStack"
    deploy_stack "MveComputeStack"
    
    print_status "All stacks deployed successfully!"
}

# Get stack outputs
get_outputs() {
    print_status "Retrieving stack outputs..."
    
    echo ""
    echo "=== Important Outputs ==="
    echo ""
    
    # Get key outputs
    local alb_dns=$(aws cloudformation describe-stacks --stack-name MveComputeStack --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDnsName'].OutputValue" --output text 2>/dev/null || echo "N/A")
    local cf_domain=$(aws cloudformation describe-stacks --stack-name MveStorageStack --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" --output text 2>/dev/null || echo "N/A")
    local ecr_uri=$(aws cloudformation describe-stacks --stack-name MveComputeStack --query "Stacks[0].Outputs[?OutputKey=='EcrRepositoryUri'].OutputValue" --output text 2>/dev/null || echo "N/A")
    local db_endpoint=$(aws cloudformation describe-stacks --stack-name MveDataStack --query "Stacks[0].Outputs[?OutputKey=='DatabaseEndpoint'].OutputValue" --output text 2>/dev/null || echo "N/A")
    local redis_endpoint=$(aws cloudformation describe-stacks --stack-name MveDataStack --query "Stacks[0].Outputs[?OutputKey=='RedisEndpoint'].OutputValue" --output text 2>/dev/null || echo "N/A")
    
    echo "CloudFront Domain: https://$cf_domain"
    echo "ALB DNS: $alb_dns"
    echo "ECR Repository: $ecr_uri"
    echo "Database Endpoint: $db_endpoint"
    echo "Redis Endpoint: $redis_endpoint"
    echo ""
    
    # Save outputs to file
    cat > infrastructure-outputs.json <<EOF
{
  "cloudfront_domain": "$cf_domain",
  "alb_dns": "$alb_dns",
  "ecr_uri": "$ecr_uri",
  "database_endpoint": "$db_endpoint",
  "redis_endpoint": "$redis_endpoint",
  "aws_account_id": "$AWS_ACCOUNT_ID",
  "aws_region": "$AWS_REGION"
}
EOF
    
    print_status "Outputs saved to infrastructure-outputs.json"
}

# Create environment file template
create_env_template() {
    print_status "Creating .env template..."
    
    # Get outputs
    local db_endpoint=$(aws cloudformation describe-stacks --stack-name MveDataStack --query "Stacks[0].Outputs[?OutputKey=='DatabaseEndpoint'].OutputValue" --output text 2>/dev/null || echo "<DATABASE_ENDPOINT>")
    local redis_endpoint=$(aws cloudformation describe-stacks --stack-name MveDataStack --query "Stacks[0].Outputs[?OutputKey=='RedisEndpoint'].OutputValue" --output text 2>/dev/null || echo "<REDIS_ENDPOINT>")
    local cf_id=$(aws cloudformation describe-stacks --stack-name MveStorageStack --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text 2>/dev/null || echo "<DISTRIBUTION_ID>")
    local cf_domain=$(aws cloudformation describe-stacks --stack-name MveStorageStack --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" --output text 2>/dev/null || echo "<DISTRIBUTION_DOMAIN>")
    
    cat > .env.production <<EOF
# MVE Production Environment Variables
# Generated on $(date)

NODE_ENV=production
PORT=3000
AWS_REGION=$AWS_REGION

# Database
DATABASE_HOST=$db_endpoint
DATABASE_NAME=mve_database
DATABASE_USER=mve_admin
DATABASE_PASSWORD=<GET_FROM_SECRETS_MANAGER>

# Redis
REDIS_HOST=$redis_endpoint
REDIS_PORT=6379
REDIS_TLS=true

# S3 Buckets
S3_STATIC_BUCKET=mve-static-$AWS_ACCOUNT_ID-$AWS_REGION
S3_DOCUMENTS_BUCKET=mve-documents-$AWS_ACCOUNT_ID-$AWS_REGION
S3_ATTACHMENTS_BUCKET=mve-attachments-$AWS_ACCOUNT_ID-$AWS_REGION

# CloudFront
CLOUDFRONT_DISTRIBUTION_ID=$cf_id
CLOUDFRONT_DOMAIN=$cf_domain

# Auth0 (configure when available)
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
EOF
    
    print_status ".env.production template created"
}

# Main execution
main() {
    echo "======================================"
    echo "   MVE Infrastructure Deployment"
    echo "======================================"
    echo ""
    
    # Parse command line arguments
    case "${1:-}" in
        --check)
            check_prerequisites
            ;;
        --bootstrap)
            check_prerequisites
            setup_environment
            install_dependencies
            bootstrap_cdk
            ;;
        --synth)
            check_prerequisites
            setup_environment
            synth_stacks
            ;;
        --deploy)
            check_prerequisites
            setup_environment
            install_dependencies
            bootstrap_cdk
            synth_stacks
            deploy_all_stacks
            get_outputs
            create_env_template
            ;;
        --outputs)
            setup_environment
            get_outputs
            ;;
        --env)
            setup_environment
            create_env_template
            ;;
        --destroy)
            print_warning "This will destroy all infrastructure!"
            read -p "Are you sure? (yes/no): " confirm
            if [ "$confirm" = "yes" ]; then
                setup_environment
                print_status "Destroying all stacks..."
                npx cdk destroy --all --force
            else
                print_status "Destruction cancelled"
            fi
            ;;
        *)
            echo "Usage: $0 [OPTION]"
            echo ""
            echo "Options:"
            echo "  --check      Check prerequisites"
            echo "  --bootstrap  Bootstrap CDK in AWS account"
            echo "  --synth      Synthesize CDK stacks"
            echo "  --deploy     Deploy all infrastructure"
            echo "  --outputs    Get stack outputs"
            echo "  --env        Create .env template"
            echo "  --destroy    Destroy all infrastructure"
            echo ""
            echo "Example:"
            echo "  $0 --deploy    # Full deployment"
            ;;
    esac
}

# Run main function
main "$@"