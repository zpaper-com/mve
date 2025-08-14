# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MVE is a React-based PDF form viewer and workflow application that enables sequential form completion by multiple parties. The application renders PDF forms, collects user input, and manages a workflow where each recipient completes their portion before passing it to the next person in the chain.

## Technology Stack

### Frontend
- **Framework**: Vite + React + TypeScript
- **UI Library**: MUI (Material-UI) v5
- **State Management**: Zustand + React Query
- **Forms**: React Hook Form + zod
- **PDF Rendering**: PDF.js
- **Routing**: React Router v6

### Backend
- **Runtime**: Node.js + Express + TypeScript
- **Database ORM**: Prisma or TypeORM
- **Authentication**: Auth0 (credentials pending)
- **Caching**: Redis for sessions
- **Email**: SendGrid
- **SMS**: Twilio (Phase 2)
- **WebSocket**: Socket.io

### Infrastructure (AWS)
- **Compute**: ECS Fargate
- **Database**: RDS PostgreSQL (Single AZ for MVP)
- **Storage**: S3 buckets for static assets and documents
- **CDN**: CloudFront with path-based routing
- **Container Registry**: ECR
- **Secrets**: AWS Secrets Manager
- **Cache**: ElastiCache Redis
- **IaC**: AWS CDK with TypeScript

## Project Structure

The project follows this anticipated structure:

```
src/
├── components/
│   ├── PDFViewer/
│   │   ├── PDFViewer.tsx
│   │   ├── PDFToolbar.tsx
│   │   ├── ThumbnailPanel.tsx
│   │   └── ZoomControls.tsx
│   ├── SendToDialog/
│   │   ├── SendToDialog.tsx
│   │   ├── RecipientCard.tsx
│   │   └── CustomWorkflow.tsx
│   └── AttachmentDialog/
│       ├── AttachmentDialog.tsx
│       ├── Dropzone.tsx
│       └── AttachmentList.tsx
├── services/
│   ├── pdfService.ts
│   ├── workflowService.ts
│   └── attachmentService.ts
├── hooks/
│   ├── usePDFViewer.ts
│   ├── useWorkflow.ts
│   └── useAttachments.ts
├── store/
└── utils/
```

## Core Architecture

### Frontend Components
- **PDFViewer**: Main component using PDF.js for rendering with signature field hiding
- **ThumbnailPanel**: Collapsible 150px width panel with page previews
- **ZoomControls**: Zoom range 25%-400% with keyboard shortcuts
- **SendToDialog**: Workflow creation with up to 10 recipients (3 for MVP)
- **AttachmentDialog**: File upload for images (25MB max, PDF support in Phase 2)

### Database Schema
```sql
-- Core tables
workflow_sessions (id, document_url, status, metadata)
recipients (id, session_id, order_index, unique_url, status, form_data)
attachments (id, session_id, file_name, s3_key, uploaded_at)
```

### CloudFront Path Routing
```
mve.zpaper.com/                     → React App (S3)
mve.zpaper.com/api/*                → Backend API (ALB)
mve.zpaper.com/documents/*/         → Dynamic content (ALB)
mve.zpaper.com/documents/*/assets/  → Static PDF assets (S3)
```

## Development Commands

Since this is an early-stage project, these commands should be implemented during initial setup:

### Frontend (anticipated)
```bash
# Development
npm run dev          # Start Vite dev server
npm run build        # Production build
npm run preview      # Preview production build

# Testing
npm run test         # Jest unit tests
npm run test:e2e     # Playwright end-to-end tests

# Linting
npm run lint         # ESLint
npm run typecheck    # TypeScript checks
```

### Backend (anticipated)
```bash
# Development
npm run dev          # Start with nodemon
npm run start        # Production start
npm run build        # Build TypeScript

# Database
npm run db:migrate   # Run Prisma migrations
npm run db:seed      # Seed test data

# Testing
npm run test         # Jest tests
npm run test:int     # Integration tests
```

### Infrastructure
```bash
# CDK deployment
cdk deploy --all     # Deploy all stacks
cdk diff             # Show changes
cdk destroy          # Remove infrastructure
```

## Key Implementation Details

### PDF.js Configuration
- Disable JavaScript in PDFs for security
- Enable interactive forms
- Hide signature fields programmatically
- Use lazy loading for pages

### Workflow System
- Base32 UUID generation for readable URLs
- 48-hour recipient timeout with 24-hour reminders
- Email notifications via SendGrid
- Sequential completion requirement

### File Upload
- Direct browser-to-S3 uploads using presigned URLs
- Multipart upload for files over 5MB
- Image validation on client and server

### Authentication
- Auth0 integration with JWT validation
- Role-based access: Admin, Provider, Patient
- Redis-backed session storage
- Social login providers (Google, Facebook, GitHub, Apple)

## AWS Services Configuration

### Core Services
- **Region**: us-east-1 (N. Virginia)
- **VPC**: Private/public subnets with NAT Gateway
- **RDS**: PostgreSQL Single AZ (t3.small)
- **ECS**: Fargate with 1 vCPU, 2GB RAM
- **S3**: Three buckets (static, documents, attachments)
- **CloudFront**: Single distribution, multiple origins

### Security
- Encryption at rest and in transit
- Least-privilege IAM roles
- Security groups with minimal access
- Secrets Manager for credentials
- Audit logging via CloudTrail

## MVP Scope and Limitations

### Included
- PDF viewing with zoom (25%-400%)
- Thumbnail navigation panel
- Basic workflow (2-3 recipients for rapid deployment)
- Email notifications only
- Image attachments only
- Desktop-first design
- Auth0 authentication (when credentials available)

### Phase 2 Features
- SMS notifications
- More than 3 recipients
- PDF attachments
- Mobile responsive design
- Custom signature component
- Advanced monitoring
- Multiple environments

## Performance Requirements
- PDF load time: <3 seconds for 10MB files
- API response time: <200ms
- Support 100 concurrent users
- Browser support: Latest 2 versions of Chrome, Firefox, Safari, Edge

## Specialized Agent Usage

When working on this codebase, use these specialized agents:
- `cloud-architect`: AWS infrastructure setup
- `deployment-engineer`: Docker, ECS, CI/CD
- `backend-architect`: API design and workflow logic
- `frontend-developer`: React components and MUI integration
- `database-optimizer`: PostgreSQL schema and queries
- `security-auditor`: Auth0 integration and security
- `typescript-pro`: Advanced TypeScript patterns
- `test-automator`: Unit and integration testing

## Development Timeline
This is a 1-week rapid deployment project with parallel development across infrastructure, backend, and frontend. Quality is minimized in favor of speed, with significant technical debt expected for Phase 2 cleanup.