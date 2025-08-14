#!/bin/bash

# MVE Infrastructure Deployment Script
# This script deploys the complete AWS infrastructure for the MVE project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REGION="us-east-1"
PROFILE="default"
STACK_NAMES=(
    "MveNetworkingStack"
    "MveDataStack"
    "MveStorageStack"
    "MveComputeStack"
)

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if CDK is installed
    if ! command -v cdk &> /dev/null; then
        log_error "AWS CDK is not installed. Please install it first: npm install -g aws-cdk"
        exit 1
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity --profile $PROFILE &> /dev/null; then
        log_error "AWS credentials not configured or invalid. Please configure AWS CLI."
        exit 1
    fi
    
    log_info "Prerequisites check passed."
}

# Install dependencies
install_dependencies() {
    log_info "Installing NPM dependencies..."
    npm install
}

# Bootstrap CDK (if needed)
bootstrap_cdk() {
    log_info "Bootstrapping CDK..."
    cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text --profile $PROFILE)/$REGION --profile $PROFILE
}

# Build the project
build_project() {
    log_info "Building TypeScript project..."
    npm run build
}

# Synthesize CloudFormation templates
synthesize_templates() {
    log_info "Synthesizing CloudFormation templates..."
    cdk synth --profile $PROFILE
}

# Deploy infrastructure
deploy_infrastructure() {
    log_info "Deploying infrastructure..."
    
    # Deploy stacks in order (respecting dependencies)
    for stack in "${STACK_NAMES[@]}"; do
        log_info "Deploying stack: $stack"
        cdk deploy $stack --require-approval never --profile $PROFILE --region $REGION
        
        if [ $? -eq 0 ]; then
            log_info "Successfully deployed: $stack"
        else
            log_error "Failed to deploy: $stack"
            exit 1
        fi
    done
}

# Display stack outputs
display_outputs() {
    log_info "Retrieving stack outputs..."
    
    for stack in "${STACK_NAMES[@]}"; do
        echo ""
        echo "=== $stack Outputs ==="
        aws cloudformation describe-stacks --stack-name $stack --query 'Stacks[0].Outputs' --output table --profile $PROFILE --region $REGION
    done
}

# Estimate costs
estimate_costs() {
    log_warn "Cost Estimation (Approximate Monthly Costs):"
    echo "================================================"
    echo "RDS PostgreSQL (db.t3.small, Single AZ): ~$25/month"
    echo "ElastiCache Redis (cache.t3.micro): ~$15/month"
    echo "ECS Fargate (2 tasks, 1vCPU, 2GB each): ~$50/month"
    echo "Application Load Balancer: ~$20/month"
    echo "NAT Gateway (1): ~$45/month"
    echo "CloudFront (assuming 1TB/month): ~$85/month"
    echo "S3 Storage (assuming 100GB): ~$2.5/month"
    echo "VPC Endpoints: ~$15/month"
    echo "================================================"
    echo "Estimated Total: ~$257.5/month"
    echo ""
    echo "Note: Costs may vary based on actual usage, data transfer, and other factors."
}

# Main deployment function
main() {
    echo "========================================="
    echo "MVE Infrastructure Deployment"
    echo "========================================="
    echo "Region: $REGION"
    echo "Profile: $PROFILE"
    echo ""
    
    check_prerequisites
    install_dependencies
    bootstrap_cdk
    build_project
    synthesize_templates
    
    # Show cost estimate before deployment
    estimate_costs
    
    # Confirm deployment
    read -p "Do you want to proceed with the deployment? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        deploy_infrastructure
        display_outputs
        
        log_info "Deployment completed successfully!"
        echo ""
        echo "Next Steps:"
        echo "1. Update CloudFront distribution origins with the actual ALB DNS name"
        echo "2. Build and push your backend Docker image to ECR"
        echo "3. Update ECS service to use the new image"
        echo "4. Upload your React app to the static S3 bucket"
        echo "5. Configure your domain DNS to point to CloudFront"
    else
        log_info "Deployment cancelled."
    fi
}

# Cleanup function (for development)
cleanup() {
    log_warn "Cleaning up infrastructure..."
    
    # Destroy stacks in reverse order
    for (( idx=${#STACK_NAMES[@]}-1 ; idx>=0 ; idx-- )) ; do
        stack="${STACK_NAMES[idx]}"
        log_info "Destroying stack: $stack"
        cdk destroy $stack --force --profile $PROFILE --region $REGION
    done
}

# Handle command line arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    cleanup|destroy)
        cleanup
        ;;
    diff)
        log_info "Showing differences..."
        cdk diff --profile $PROFILE
        ;;
    synth)
        log_info "Synthesizing templates only..."
        synthesize_templates
        ;;
    *)
        echo "Usage: $0 [deploy|cleanup|diff|synth]"
        echo "  deploy  - Deploy infrastructure (default)"
        echo "  cleanup - Destroy all infrastructure"
        echo "  diff    - Show differences"
        echo "  synth   - Synthesize CloudFormation templates only"
        exit 1
        ;;
esac