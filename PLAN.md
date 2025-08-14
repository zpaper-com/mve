# MVE Project - PLAN.md

## Project Overview

MVE is a React-based PDF form viewer and workflow application that enables sequential form completion by multiple parties. The application renders PDF forms, collects user input, and manages a workflow where each recipient completes their portion before passing it to the next person in the chain.

## Core Features

### 1. PDF Viewer (`/merx` route)
- **URL**: Direct access via `https://mve.zpaper.com/merx`
- **PDF Source**: Serves `https://qr.md/kb/books/merx.pdf`
- **No authentication required** for initial access
- **Full browser width rendering** for optimal viewing experience
- **PDF.js integration** for rendering and form field interaction

### 2. Signature Field Handling
- **Hide all existing prescriber signature fields** in the PDF
- Signature fields will be programmatically detected and hidden using PDF.js
- Future implementation will include custom signature component using React Signature Canvas

### 3. Thumbnail Navigation Panel
- **Collapsible panel** on the left side of the screen
- **Fixed thumbnail size** showing page previews from initial PDF load
- **Click-to-navigate** functionality for quick page jumping
- **Minimal width** (approximately 150-200px) to maximize PDF viewing area
- **Toggle button** to show/hide the thumbnail panel

### 4. Zoom Controls
- **Continuous zoom** functionality (both in and out)
- **Zoom range**: 25% to 400%
- **Implementation methods**:
  - Mouse wheel with Ctrl/Cmd key
  - Zoom in/out buttons in toolbar
  - Pinch-to-zoom on touch devices
- **Zoom level indicator** showing current percentage

### 5. Send To Dialog Integration
- **Button labeled "Send To"** in the toolbar
- **Creates sequential workflow** with unique URLs for each recipient
- **UUID generation**: Base32 encoding for human-readable URLs
- **Database storage**: PostgreSQL tracks each recipient's unique link and completion status
- **Notification flow**:
  1. First recipient receives email/text with their unique URL
  2. Upon form submission, next recipient is automatically notified
  3. Each subsequent user sees all previously filled data
  4. Process continues until all recipients complete their portions

### 6. Attachment Feature
- **"Attach" button** in the toolbar opens upload dialog
- **Dropzone interface** for drag-and-drop file upload
- **Accepted formats**: Images (JPEG, PNG, GIF) and PDFs
- **File size limit**: 25MB per file
- **S3 Storage Structure**:
  ```
  /documents/{session-uuid}/
    ├── form.pdf (main document)
    └── attachments/
        ├── {attachment-1-uuid}.pdf
        └── {attachment-2-uuid}.jpg
  ```
- **Database tracking**: Attachment metadata linked to PDF session

## Technical Architecture

### Frontend Components Structure
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
└── hooks/
    ├── usePDFViewer.ts
    ├── useWorkflow.ts
    └── useAttachments.ts
```

### Database Schema

#### Workflow Sessions Table
```sql
CREATE TABLE workflow_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_url VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'active',
    metadata JSONB
);
```

#### Recipients Table
```sql
CREATE TABLE recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES workflow_sessions(id),
    order_index INTEGER NOT NULL,
    recipient_type VARCHAR(50) NOT NULL,
    party_name VARCHAR(255),
    email VARCHAR(255),
    mobile VARCHAR(20),
    npi VARCHAR(10),
    unique_url VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    accessed_at TIMESTAMP,
    completed_at TIMESTAMP,
    form_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### Attachments Table
```sql
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES workflow_sessions(id),
    recipient_id UUID REFERENCES recipients(id),
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size INTEGER NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    uploaded_by UUID REFERENCES recipients(id)
);
```

### API Endpoints

#### PDF Viewer Endpoints
- `GET /api/pdf/merx` - Retrieve PDF with hidden signature fields
- `GET /api/pdf/:sessionId/thumbnails` - Get pre-generated thumbnails
- `POST /api/pdf/:sessionId/form-data` - Save form field data

#### Workflow Endpoints
- `POST /api/workflow/create` - Initialize new workflow session
- `GET /api/workflow/:uniqueUrl` - Get workflow state for recipient
- `POST /api/workflow/:uniqueUrl/submit` - Submit form and trigger next recipient
- `GET /api/workflow/:sessionId/status` - Get overall workflow status

#### Attachment Endpoints
- `POST /api/attachments/:sessionId/upload` - Upload file to S3
- `GET /api/attachments/:sessionId` - List all attachments for session
- `DELETE /api/attachments/:attachmentId` - Remove attachment

### Key Implementation Details

#### PDF.js Configuration
```typescript
const pdfViewerOptions = {
  cMapUrl: '/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/standard_fonts/',
  enableScripting: false, // Disable JavaScript in PDFs
  renderInteractiveForms: true,
  enablePrintAutoRotate: true
};
```

#### Signature Field Detection and Hiding
```typescript
// Detect and hide signature fields
async function hideSignatureFields(pdfDocument: PDFDocumentProxy) {
  const annotations = await pdfDocument.getFieldObjects();
  
  Object.entries(annotations).forEach(([fieldName, field]) => {
    if (field.type === 'Sig' || fieldName.toLowerCase().includes('prescriber')) {
      // Hide field programmatically
      field.hidden = true;
    }
  });
}
```

#### Base32 URL Generation
```typescript
import { encode } from 'base32-encode';
import { randomBytes } from 'crypto';

function generateUniqueUrl(): string {
  const buffer = randomBytes(20); // 160 bits
  return encode(buffer, 'RFC4648', { padding: false }).toLowerCase();
}
```

### Security Considerations

1. **File Upload Security**
   - Validate file types on both client and server
   - Scan files for malware before S3 upload
   - Generate signed S3 URLs with expiration

2. **URL Security**
   - Base32 URLs are unguessable but not encrypted
   - Add rate limiting to prevent brute force attempts
   - Log all access attempts for audit trail

3. **Data Privacy**
   - Each recipient only sees data from previous recipients in the chain
   - Implement field-level permissions if needed
   - Encrypt sensitive data at rest in PostgreSQL

### Performance Optimizations

1. **PDF Rendering**
   - Lazy load PDF pages as user scrolls
   - Cache rendered pages in memory
   - Pre-generate thumbnails on server side

2. **Attachment Handling**
   - Direct browser-to-S3 uploads using presigned URLs
   - Multipart upload for files over 5MB
   - Progressive upload feedback

3. **Workflow Processing**
   - Queue-based notification system
   - Batch database operations
   - Redis caching for active sessions

## Development Phases

### Phase 1: Core PDF Viewer
- Implement PDF.js integration
- Create thumbnail panel
- Add zoom controls
- Hide signature fields

### Phase 2: Send To Dialog
- Implement dialog UI from specification
- Create workflow session management
- Set up notification system
- Generate unique URLs

### Phase 3: Attachment System
- Build dropzone UI
- Implement S3 upload flow
- Create attachment management
- Update database schema

### Phase 4: Integration & Testing
- End-to-end workflow testing
- Performance optimization
- Security audit
- Documentation

## Testing Strategy

### Unit Tests
- Component rendering tests
- Service function tests
- Utility function tests

### Integration Tests
- API endpoint tests
- Database operation tests
- S3 upload/download tests

### E2E Tests (Playwright)
- Complete workflow from start to finish
- Multi-recipient scenarios
- Attachment upload/download flows
- Error handling scenarios

## Monitoring & Analytics

### Key Metrics
- PDF load times
- Workflow completion rates
- Attachment upload success rates
- User session duration
- Error rates by component

### Logging
- Structured logging with correlation IDs
- Workflow state transitions
- File upload/download events
- Error tracking with stack traces

## Future Enhancements

1. **Signature Component** (Phase 2)
   - React Signature Canvas integration
   - Signature placement on PDF
   - Signature validation

2. **Advanced PDF Features**
   - Form field validation
   - Conditional logic for fields
   - Auto-save functionality

3. **Enhanced Notifications**
   - SMS integration
   - In-app notifications
   - Reminder system

4. **Analytics Dashboard**
   - Workflow completion analytics
   - User engagement metrics
   - Performance monitoring
