# MVE Project - Implementation Clarifications

## Technology Stack Preferences

### Frontend Framework
**Question**: The plan mentions React with TypeScript. Do you want to use any specific React framework?
**Vite** - Modern, fast build tool with excellent TypeScript support and optimized production builds. Better performance than Create React App and simpler than Next.js for SPA requirements.

### State Management
**Question**: Should we use Redux, Zustand, Context API, or another solution?
**Zustand** - Lightweight, TypeScript-friendly, minimal boilerplate. Perfect for medium-complexity apps. Use React Query/TanStack Query for server state management.

### UI Component Library
**Question**: Any preference for UI components?
**MUI**

### Form Handling
**Question**: React Hook Form, Formik, or custom implementation?
**React Hook Form** - Better performance, smaller bundle size, built-in TypeScript support, and excellent validation integration with zod.

## Authentication Details

### Auth0 Tenant
**Question**: Do you have an existing Auth0 account/tenant, or should this be created?
I'll provide credentials later

### User Registration Flow
**Question**: Should users self-register or be invited only?
users are invited by sent to dialog. admins are created manually.

### Mobile Number Collection
**Question**: Required for all users or specific roles only?
**Optional for all users** but strongly encouraged. Required for workflow notifications if SMS is selected as notification preference.

## PDF Handling Specifics

### PDF Source
**Question**: The plan mentions `https://qr.md/kb/books/merx.pdf`. Is this URL correct and accessible?
Store PDF templates in S3 bucket with versioning. Initial PDF uploaded during deployment.

### Form Field Preservation
**Question**: When hiding signature fields, should the data be preserved for later use?
**Yes, preserve data** - Hide visually but maintain field data in database for audit trail and future signature implementation.

### Custom Fields
**Question**: Will you need to add custom form fields beyond what's in the original PDF?
**No custom fields initially** - MVP uses only existing PDF form fields. Future enhancement to add dynamic fields post-MVP.

## Workflow Requirements

### Notification Preferences
**Question**: Email only, SMS only, or both? Any specific providers?
**Both email and SMS** - SendGrid for email (better deliverability, good API), Twilio for SMS (industry standard, reliable).

### Recipient Limits
**Question**: Maximum number of recipients in a workflow chain?
**10 recipients maximum** per workflow for MVP. Can be increased based on performance testing.

### Timeout Handling
**Question**: What happens if a recipient doesn't complete their portion?
**48-hour timeout** with:
- Automated reminder at 24 hours
- Escalation notification to workflow initiator at 48 hours
- No auto-skip to maintain data integrity

## Infrastructure Decisions

### AWS Account
**Question**: Existing account with specific constraints or new setup?
**Existing AWS account**

### Environment Strategy
**Question**: How many environments needed?
- Production (mve.zpaper.com)

### Domain Status
**Question**: Is mve.zpaper.com already configured in Route 53?
**Domain not yet configured** - Need to create Route 53 hosted zone and configure DNS records as part of infrastructure setup.

## Development Priorities

### MVP Scope
**Question**: Which features are absolutely essential for the first release?
**Core MVP Features**:
1. PDF viewing with zoom and thumbnails
2. Basic workflow (2-3 recipients)
3. Email notifications only (SMS in Phase 2)
4. File attachments (images only initially)
5. Basic authentication (social login)
6. Desktop-first (mobile optimization in Phase 2)

### Deployment Timeline
**Question**: Target date for MVP deployment?
**1 week from start**:
- Weeks 1: Infrastructure setup
- Weeks 1: Backend API development
- Weeks 1: Frontend core components
- Weeks 1: Integration and workflow
- Weeks 1: Testing and deployment

### Team Size
**Question**: How many developers will be working on this?
**2-3 developers**:
- 1 Full-stack senior developer (lead)
- 1 Frontend-focused developer
- 1 DevOps/Backend developer (part-time)

## Compliance & Security

### Data Residency
**Question**: Any requirements for data location?
**US-East-1 (N. Virginia)** - Best service availability, lowest costs, no specific data residency requirements.

### Compliance Standards
**Question**: HIPAA, SOC2, or other compliance requirements?
**Prepare for future HIPAA compliance**:
- Implement encryption at rest and in transit
- Audit logging from day one
- Role-based access control
- No PHI in logs
- Design for future BAA with AWS

### Backup Requirements
**Question**: Beyond the 7-day retention mentioned, any specific disaster recovery needs?
**Standard backup strategy**:
- 7-day automated RDS backups
- 30-day S3 versioning for documents
- Daily database snapshots exported to S3
- Cross-region backup replication for production (Phase 2)

## Existing Assets

### Design Assets
**Question**: Do you have UI/UX designs or wireframes for the SendTo dialog and other components?
**No existing designs** - Build based on specifications in PLAN.md with standard Material Design patterns for consistency.

### API Documentation
**Question**: Any existing API specifications or contracts to follow?
**Create new OpenAPI 3.0 specification** - Document as we build, use Swagger UI for testing and documentation.

### Test Data
**Question**: Sample PDFs and test scenarios available?
**Use provided merx.pdf** as primary test document. Create synthetic test data for workflow scenarios. Generate additional test PDFs as needed.

## Additional Considerations

### Performance Requirements

- PDF load time: <3 seconds for 10MB file
- API response time: <200ms for typical requests
- Support 100 concurrent users for MVP

### Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- No Internet Explorer support

### Monitoring and Analytics
**Default Answer**:
- CloudWatch for infrastructure monitoring
- Basic custom analytics dashboard in Phase 2

### Internationalization
**English only for MVP** - Build with i18n framework ready but no initial translations.

### Accessibility
**WCAG 2.1 Level AA compliance** - Keyboard navigation, screen reader support, proper ARIA labels.

---

