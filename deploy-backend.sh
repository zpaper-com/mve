#!/bin/bash

# Backend Deployment Script for MVE Project
# Builds Docker image, pushes to ECR, and updates ECS service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REGION="us-east-1"
PROFILE="default"
CLUSTER_NAME="mve-cluster"
SERVICE_NAME="mve-backend-service"
IMAGE_TAG="${1:-latest}"

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

# Get ECR repository URI from CloudFormation outputs
get_ecr_uri() {
    log_info "Getting ECR repository URI..."
    ECR_URI=$(aws cloudformation describe-stacks \
        --stack-name MveComputeStack \
        --query 'Stacks[0].Outputs[?OutputKey==`EcrRepositoryUri`].OutputValue' \
        --output text \
        --profile $PROFILE \
        --region $REGION)
    
    if [ -z "$ECR_URI" ]; then
        log_error "Could not retrieve ECR repository URI. Make sure infrastructure is deployed."
        exit 1
    fi
    
    log_info "ECR Repository URI: $ECR_URI"
}

# Login to ECR
ecr_login() {
    log_info "Logging in to ECR..."
    aws ecr get-login-password --region $REGION --profile $PROFILE | \
        docker login --username AWS --password-stdin $ECR_URI
}

# Build Docker image
build_image() {
    log_info "Building Docker image..."
    docker build -t mve-backend:$IMAGE_TAG .
    docker tag mve-backend:$IMAGE_TAG $ECR_URI:$IMAGE_TAG
}

# Push image to ECR
push_image() {
    log_info "Pushing image to ECR..."
    docker push $ECR_URI:$IMAGE_TAG
}

# Update ECS service
update_service() {
    log_info "Updating ECS service..."
    
    # Get current task definition
    TASK_DEFINITION=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --query 'services[0].taskDefinition' \
        --output text \
        --profile $PROFILE \
        --region $REGION)
    
    log_info "Current task definition: $TASK_DEFINITION"
    
    # Force new deployment to pick up the new image
    aws ecs update-service \
        --cluster $CLUSTER_NAME \
        --service $SERVICE_NAME \
        --force-new-deployment \
        --profile $PROFILE \
        --region $REGION
    
    log_info "Service update initiated. New tasks will pull the updated image."
}

# Wait for deployment to complete
wait_for_deployment() {
    log_info "Waiting for deployment to complete..."
    
    aws ecs wait services-stable \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --profile $PROFILE \
        --region $REGION
    
    if [ $? -eq 0 ]; then
        log_info "Deployment completed successfully!"
    else
        log_error "Deployment timed out or failed. Check ECS console for details."
        exit 1
    fi
}

# Display service status
show_status() {
    log_info "Current service status:"
    
    aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --query 'services[0].{
            ServiceName: serviceName,
            Status: status,
            RunningCount: runningCount,
            PendingCount: pendingCount,
            DesiredCount: desiredCount,
            TaskDefinition: taskDefinition
        }' \
        --output table \
        --profile $PROFILE \
        --region $REGION
}

# Show recent logs
show_logs() {
    log_info "Recent application logs:"
    
    aws logs tail /ecs/mve-backend \
        --since 10m \
        --profile $PROFILE \
        --region $REGION
}

# Main deployment function
main() {
    echo "========================================="
    echo "MVE Backend Deployment"
    echo "========================================="
    echo "Image tag: $IMAGE_TAG"
    echo "Region: $REGION"
    echo "Profile: $PROFILE"
    echo ""
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check if backend source code exists
    if [ ! -f "package.json" ]; then
        log_error "No package.json found. Make sure you're in the backend directory."
        exit 1
    fi
    
    get_ecr_uri
    ecr_login
    build_image
    push_image
    update_service
    
    # Ask if user wants to wait for deployment
    read -p "Wait for deployment to complete? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        wait_for_deployment
        show_status
        
        # Ask if user wants to see logs
        read -p "Show recent logs? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            show_logs
        fi
    else
        log_info "Deployment initiated. Use 'aws ecs describe-services' to check status."
    fi
}

# Rollback function
rollback() {
    log_warn "Rolling back to previous task definition..."
    
    # Get service details
    SERVICE_DETAILS=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --profile $PROFILE \
        --region $REGION)
    
    # Get task definition family
    FAMILY=$(echo $SERVICE_DETAILS | jq -r '.services[0].taskDefinition' | cut -d'/' -f1)
    
    # Get previous revision
    CURRENT_REVISION=$(echo $SERVICE_DETAILS | jq -r '.services[0].taskDefinition' | cut -d':' -f2)
    PREVIOUS_REVISION=$((CURRENT_REVISION - 1))
    
    if [ $PREVIOUS_REVISION -lt 1 ]; then
        log_error "No previous revision available for rollback."
        exit 1
    fi
    
    PREVIOUS_TASK_DEF="$FAMILY:$PREVIOUS_REVISION"
    
    log_info "Rolling back to: $PREVIOUS_TASK_DEF"
    
    aws ecs update-service \
        --cluster $CLUSTER_NAME \
        --service $SERVICE_NAME \
        --task-definition $PREVIOUS_TASK_DEF \
        --profile $PROFILE \
        --region $REGION
    
    log_info "Rollback initiated."
}

# Handle command line arguments
case "${1:-deploy}" in
    deploy)
        shift
        IMAGE_TAG="${1:-latest}"
        main
        ;;
    rollback)
        rollback
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "Usage: $0 [deploy [tag]|rollback|status|logs]"
        echo "  deploy [tag] - Build and deploy backend (default tag: latest)"
        echo "  rollback     - Rollback to previous task definition"
        echo "  status       - Show current service status"
        echo "  logs         - Show recent application logs"
        exit 1
        ;;
esac