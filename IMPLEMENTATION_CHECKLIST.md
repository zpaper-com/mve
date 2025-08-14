# MVE Project - Implementation Checklist for Subagents

Based on the updated clarifications, here's the comprehensive implementation checklist organized for rapid 1-week deployment:

## 🚀 Critical Path (All tasks to be executed in parallel where possible)

### **Day 1-2: Infrastructure & Backend Foundation**

#### AWS Infrastructure (CDK) - Use: `cloud-architect` + `deployment-engineer`
- [ ] **VPC & Networking** (2 hours)
  - [ ] Create VPC with public/private subnets in us-east-1
  - [ ] Configure NAT Gateway for private subnet access
  - [ ] Set up Security Groups with least-privilege access
  - [ ] Configure VPC endpoints for AWS services

- [ ] **Database Layer** (3 hours)
  - [ ] Deploy RDS PostgreSQL (Single AZ) - t3.small instance
  - [ ] Create database schemas:
    ```sql
    -- workflow_sessions table
    -- recipients table  
    -- attachments table
    ```
  - [ ] Configure 7-day automated backups
  - [ ] Set up Secrets Manager for credentials (manual rotation initially)
  - [ ] Deploy ElastiCache Redis (t3.micro) for sessions

- [ ] **Storage & CDN** (2 hours)
  - [ ] Create S3 buckets:
    - [ ] `mve-zpaper-static` - React app and assets
    - [ ] `mve-zpaper-documents` - PDFs with versioning
    - [ ] `mve-zpaper-attachments` - User uploads
  - [ ] Enable 30-day versioning on document bucket
  - [ ] Configure CloudFront distribution with path routing:
    - `/` → S3 React app
    - `/api/*` → ALB (future)
    - `/documents/*` → Dynamic content
  - [ ] Request SSL certificate for *.zpaper.com in ACM

- [ ] **Container Services** (3 hours)
  - [ ] Create ECR repository `mve-backend`
  - [ ] Set up ECS Fargate cluster
  - [ ] Create task definition (1 vCPU, 2GB RAM)
  - [ ] Deploy Application Load Balancer
  - [ ] Configure target group with health checks

#### Backend API Setup - Use: `backend-architect` + `typescript-pro`
- [ ] **Express Application** (4 hours)
  - [ ] Initialize Node.js/Express with TypeScript
  - [ ] Configure WebSocket support (socket.io)
  - [ ] Set up CORS for mve.zpaper.com
  - [ ] Implement rate limiting (100 req/min)
  - [ ] Add structured logging with winston
  - [ ] Configure error handling middleware

- [ ] **Database Models** (2 hours) - Use: `database-optimizer`
  - [ ] Set up Prisma ORM or TypeORM
  - [ ] Create models for:
    - [ ] WorkflowSession
    - [ ] Recipient
    - [ ] Attachment
  - [ ] Run initial migrations

- [ ] **Auth0 Integration** (3 hours) - Use: `security-auditor`
  - [ ] Wait for Auth0 credentials from client
  - [ ] Configure Auth0 middleware
  - [ ] Set up JWT validation
  - [ ] Implement role-based access (Admin only for now)
  - [ ] Configure Redis session storage

### **Day 2-3: Frontend Core**

#### React Application - Use: `frontend-developer` + `typescript-pro`
- [ ] **Project Setup with Vite** (2 hours)
  - [ ] Initialize Vite + React + TypeScript
  - [ ] Install and configure MUI v5
  - [ ] Set up Zustand for state management
  - [ ] Configure React Query for server state
  - [ ] Set up React Hook Form + zod validation
  - [ ] Configure routing with React Router v6

- [ ] **Project Structure** (1 hour)
  ```
  src/
  ├── components/
  │   ├── PDFViewer/
  │   ├── SendToDialog/
  │   └── AttachmentDialog/
  ├── services/
  ├── hooks/
  ├── store/
  └── utils/
  ```

#### PDF Viewer Component - Use: `frontend-developer` + `javascript-pro`
- [ ] **PDF.js Integration** (4 hours)
  - [ ] Install pdfjs-dist and configure worker
  - [ ] Create PDFViewer component with:
    - [ ] Document loading from S3
    - [ ] Page rendering with lazy loading
    - [ ] Memory caching for rendered pages
  - [ ] Implement signature field detection and hiding

- [ ] **Thumbnail Panel** (3 hours)
  - [ ] Create ThumbnailPanel component (150px width)
  - [ ] Implement thumbnail generation
  - [ ] Add click-to-navigate
  - [ ] Create collapse/expand toggle with MUI IconButton

- [ ] **Zoom Controls** (2 hours)
  - [ ] Create ZoomControls component with MUI
  - [ ] Implement zoom range (25% - 400%)
  - [ ] Add keyboard shortcuts (Ctrl/Cmd + mouse wheel)
  - [ ] Create zoom level indicator
  - [ ] Add MUI ButtonGroup for zoom buttons

### **Day 3-4: Workflow System**

#### SendTo Dialog - Use: `frontend-developer` + `backend-architect`
- [ ] **UI Components with MUI** (4 hours)
  - [ ] Create SendToDialog using MUI Dialog
  - [ ] Build RecipientCard with MUI Card
  - [ ] Add recipient form with:
    - [ ] Email field (required)
    - [ ] Mobile field (optional for MVP)
    - [ ] Party name field
  - [ ] Limit to 3 recipients for rapid MVP
  - [ ] Use MUI Stepper for workflow preview

- [ ] **Workflow Backend** (4 hours) - Use: `backend-architect` + `typescript-pro`
  - [ ] Implement Base32 UUID generation
  - [ ] Create workflow session endpoints:
    - [ ] POST /api/workflow/create
    - [ ] GET /api/workflow/:uniqueUrl
    - [ ] POST /api/workflow/:uniqueUrl/submit
  - [ ] Build email notification with SendGrid (SMS Phase 2)
  - [ ] Implement 48-hour timeout logic

- [ ] **Database Integration** (2 hours) - Use: `database-optimizer`
  - [ ] Store workflow sessions
  - [ ] Track recipient status
  - [ ] Save form data per recipient
  - [ ] Implement status transitions

### **Day 4-5: Attachments & Integration**

#### Attachment System - Use: `frontend-developer` + `backend-architect` + `cloud-architect`
- [ ] **Attachment Dialog with MUI** (3 hours)
  - [ ] Create AttachmentDialog component
  - [ ] Use MUI Dropzone or react-dropzone
  - [ ] Implement file validation (images only, 25MB max)
  - [ ] Build AttachmentList with MUI List
  - [ ] Add delete functionality

- [ ] **S3 Upload Integration** (3 hours)
  - [ ] Generate presigned URLs
  - [ ] Implement client-side upload
  - [ ] Add upload progress with MUI LinearProgress
  - [ ] Store metadata in database

- [ ] **API Endpoints** (2 hours)
  - [ ] POST /api/attachments/upload
  - [ ] GET /api/attachments/:sessionId
  - [ ] DELETE /api/attachments/:id

### **Day 5-6: Integration & Deployment**

#### System Integration - Use: `general-purpose` + `test-automator`
- [ ] **Frontend-Backend Integration** (4 hours)
  - [ ] Connect all API endpoints
  - [ ] Test complete workflow
  - [ ] Implement error handling
  - [ ] Add loading states with MUI Skeleton

- [ ] **Docker & Deployment** (3 hours) - Use: `deployment-engineer`
  - [ ] Create Dockerfile for backend
  - [ ] Build and push to ECR
  - [ ] Deploy to ECS Fargate
  - [ ] Configure CloudFront behaviors

- [ ] **Domain & DNS** (2 hours) - Use: `network-engineer`
  - [ ] Configure Route 53 hosted zone
  - [ ] Point mve.zpaper.com to CloudFront
  - [ ] Verify SSL certificate
  - [ ] Test domain resolution

### **Day 6-7: Testing & Launch**

#### Testing - Use: `test-automator` + `debugger` + `incident-responder`
- [ ] **Critical Path Testing** (4 hours)
  - [ ] Test PDF viewing and zoom
  - [ ] Test 2-3 recipient workflow
  - [ ] Test email notifications
  - [ ] Test file attachments (images)
  - [ ] Test Auth0 login (when credentials available)

- [ ] **Bug Fixes & Polish** (4 hours) - Use: `debugger` + `code-reviewer`
  - [ ] Fix critical bugs only
  - [ ] Ensure MUI theme consistency
  - [ ] Add basic error messages
  - [ ] Verify CORS configuration

- [ ] **Production Deployment** (2 hours) - Use: `deployment-engineer` + `incident-responder`
  - [ ] Final deployment to production
  - [ ] Smoke test all features
  - [ ] Monitor CloudWatch logs
  - [ ] Document known limitations

## 📋 MVP Scope Adjustments

### **Included in Week 1 MVP**
- ✅ PDF viewing with zoom and thumbnails
- ✅ Basic workflow (2-3 recipients max)
- ✅ Email notifications only (SendGrid)
- ✅ Image attachments only (25MB max)
- ✅ Desktop-only optimization
- ✅ MUI components for consistent UI
- ✅ Production deployment to mve.zpaper.com

### **Deferred to Phase 2**
- ❌ SMS notifications (Twilio integration)
- ❌ More than 3 recipients
- ❌ PDF attachments
- ❌ Mobile responsive design
- ❌ Multiple environments (dev/staging)
- ❌ Comprehensive testing
- ❌ Auth0 social logins (pending credentials)
- ❌ Advanced monitoring
- ❌ Custom signature component

## 🛠 Technology Stack Summary

### **Frontend**
- **Framework**: Vite + React + TypeScript
- **UI Library**: MUI (Material-UI) v5
- **State**: Zustand + React Query
- **Forms**: React Hook Form + zod
- **PDF**: PDF.js
- **Routing**: React Router v6

### **Backend**
- **Runtime**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Prisma/TypeORM
- **Cache**: Redis for sessions
- **Auth**: Auth0 (pending credentials)
- **Email**: SendGrid
- **WebSocket**: Socket.io

### **Infrastructure**
- **Cloud**: AWS (us-east-1)
- **Containers**: ECS Fargate
- **CDN**: CloudFront
- **Storage**: S3
- **Database**: RDS PostgreSQL (Single AZ)
- **IaC**: AWS CDK (if time permits) or Console

## 🚨 Critical Success Factors

1. **Parallel Execution**: Multiple developers must work simultaneously
2. **Minimal Scope**: Only core features, no nice-to-haves
3. **MUI Components**: Use pre-built components, no custom styling
4. **Skip Auth0**: Use basic admin authentication until credentials provided
5. **Manual Deployment**: Use AWS Console if CDK takes too long
6. **Focus on Working**: Perfect is the enemy of done

## 📝 Daily Standup Checkpoints

### **Day 1 EOD**
- [ ] VPC and core infrastructure created
- [ ] Database schema deployed
- [ ] Basic Express server running locally

### **Day 2 EOD**
- [ ] React app initialized with MUI
- [ ] PDF viewer rendering merx.pdf
- [ ] Backend containerized

### **Day 3 EOD**
- [ ] Thumbnail panel working
- [ ] Zoom controls functional
- [ ] SendTo dialog UI complete

### **Day 4 EOD**
- [ ] Workflow creation working
- [ ] Email notifications sending
- [ ] Attachment upload to S3 working

### **Day 5 EOD**
- [ ] Full integration complete
- [ ] Deployed to ECS
- [ ] CloudFront serving application

### **Day 6 EOD**
- [ ] All critical bugs fixed
- [ ] Domain configured and working
- [ ] End-to-end workflow tested

### **Day 7**
- [ ] Production deployment complete
- [ ] Documentation updated
- [ ] Handoff to client

## 🔧 Contingency Plans

If running behind schedule:
1. **Drop attachments** - Add in Phase 2
2. **Simplify workflow** - Single recipient only
3. **Skip thumbnails** - Just zoom controls
4. **Basic auth** - Simple password instead of Auth0
5. **Manual deployment** - Skip CDK/automation

## 📞 Support & Resources

- **AWS Support**: Use existing business support
- **MUI Documentation**: https://mui.com/
- **PDF.js Examples**: https://mozilla.github.io/pdf.js/examples/
- **SendGrid Quickstart**: https://docs.sendgrid.com/for-developers/sending-email/quickstart-nodejs

## 🤖 Agent Assignment Reference

The following specialized agents are recommended for different task categories:

| Agent | Primary Use | Tasks |
|-------|-------------|-------|
| `cloud-architect` | AWS Infrastructure | VPC, RDS, S3, CloudFront setup |
| `deployment-engineer` | CI/CD & Containers | Docker, ECS, ECR, deployments |
| `backend-architect` | API Design | Express, endpoints, workflow logic |
| `database-optimizer` | Database Tasks | Schema design, ORM setup, migrations |
| `security-auditor` | Authentication | Auth0, JWT, security middleware |
| `frontend-developer` | React Components | UI components, MUI integration |
| `typescript-pro` | TypeScript Code | Type safety, advanced TS patterns |
| `javascript-pro` | Complex JS | PDF.js integration, client-side logic |
| `network-engineer` | DNS & Networking | Route 53, SSL, domain configuration |
| `test-automator` | Testing | Test suites, integration testing |
| `debugger` | Issue Resolution | Bug fixes, error handling |
| `code-reviewer` | Code Quality | Final code review, consistency checks |
| `incident-responder` | Production Issues | Deployment monitoring, quick fixes |
| `general-purpose` | Coordination | Multi-step tasks, research, planning |

**Usage**: Use the Task tool with the specified `subagent_type` parameter to invoke these specialized agents for their respective tasks.

---

**Note**: This checklist is optimized for rapid 1-week deployment. Quality and testing are minimized in favor of speed. Plan for significant technical debt that will need addressing in Phase 2.