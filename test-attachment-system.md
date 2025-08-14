# MVE Attachment System - End-to-End Test Plan

## Overview

This document outlines the testing strategy for the complete attachment system implementation with S3 direct upload, including all components from infrastructure to frontend.

## System Components Implemented

### Cloud Infrastructure ✅
1. **S3 Storage Configuration**
   - Enhanced CORS settings for browser uploads
   - Lifecycle policies for cost optimization
   - Multipart upload cleanup
   - Security encryption (AES256)

2. **CloudFront Distribution**
   - Path-based routing for API and static content
   - Security headers implementation

### Backend API ✅
1. **Attachment Service**
   - Presigned URL generation (15-minute expiry)
   - Upload confirmation with file validation
   - Magic number checking for file types
   - S3 integration with proper error handling

2. **REST Endpoints**
   - `POST /api/attachments/:sessionId/presigned-url` - Get upload URL
   - `POST /api/attachments/:attachmentId/confirm` - Confirm upload
   - `GET /api/attachments/:sessionId` - List attachments
   - `GET /api/attachments/:attachmentId/url` - Get download URL
   - `DELETE /api/attachments/:attachmentId` - Delete attachment

3. **Security & Validation**
   - File type restriction (images only for MVP)
   - Size limit enforcement (25MB)
   - Filename sanitization
   - MIME type validation

### Frontend Implementation ✅
1. **React Components**
   - Enhanced AttachmentDialog with error handling
   - Interactive Dropzone with progress tracking
   - AttachmentList with preview and download
   - File validation and user feedback

2. **React Query Integration**
   - Optimistic updates
   - Error recovery
   - Cache invalidation
   - Retry logic with exponential backoff

3. **User Experience**
   - Drag-and-drop file upload
   - Progress indicators
   - Error notifications
   - Upload cancellation
   - Image preview capability

## Testing Scenarios

### 1. Basic Upload Flow
**Test Steps:**
1. Open AttachmentDialog with valid sessionId
2. Select or drag image file (< 25MB)
3. Verify upload progress display
4. Confirm file appears in attachment list
5. Verify file can be downloaded

**Expected Results:**
- File uploads successfully to S3
- Progress bar shows accurate progress
- File metadata stored in database
- Download link works correctly

### 2. File Validation
**Test Steps:**
1. Attempt to upload unsupported file type (e.g., .txt)
2. Attempt to upload file > 25MB
3. Attempt to upload file with invalid filename
4. Upload valid image file

**Expected Results:**
- Invalid files rejected with clear error messages
- Valid files upload successfully
- Error notifications displayed appropriately

### 3. Error Handling & Retry
**Test Steps:**
1. Simulate network failure during upload
2. Verify retry mechanism activates
3. Test upload cancellation
4. Test recovery from partial failures

**Expected Results:**
- Automatic retry with exponential backoff
- User can cancel uploads
- Graceful error recovery
- Clear error messaging

### 4. Concurrent Operations
**Test Steps:**
1. Upload multiple files simultaneously
2. Delete files while others are uploading
3. Download files during active uploads

**Expected Results:**
- Multiple uploads handled correctly
- UI remains responsive
- Operations don't interfere with each other

### 5. Session Integration
**Test Steps:**
1. Test without sessionId (should disable upload)
2. Test with invalid sessionId
3. Test attachment listing and management

**Expected Results:**
- Proper session validation
- Attachments associated with correct sessions
- Security boundaries maintained

## Performance Requirements

### Upload Performance
- **Target**: < 3 seconds for 10MB files
- **Progress**: Real-time progress tracking
- **Throughput**: Support 5 concurrent uploads

### API Performance  
- **Response Time**: < 200ms for presigned URLs
- **Reliability**: 99.9% success rate
- **Error Recovery**: Automatic retry up to 3 attempts

### User Experience
- **Feedback**: Immediate validation errors
- **Cancellation**: < 1 second response time
- **Preview**: < 2 seconds for image preview

## Security Validation

### File Security
- Only image files accepted (JPEG, PNG, GIF, WebP, BMP)
- Magic number validation for file type verification
- Filename sanitization to prevent attacks
- Size limits enforced at multiple layers

### Access Control
- Presigned URLs expire in 15 minutes
- Session-based access validation
- S3 bucket access restricted via IAM
- CORS properly configured for browser security

### Data Protection
- Files encrypted at rest (S3 server-side encryption)
- Data transmission over HTTPS only
- No sensitive data in URLs or logs
- Proper error handling without data leakage

## Integration Points

### Workflow System
- Attachments properly associated with workflow sessions
- Recipients can view attachments from previous steps
- File sharing across workflow participants

### PDF Viewer Integration
- Attachments accessible from PDF viewer
- Seamless user experience between components
- Context switching preserved

### Email Notifications
- Attachment notifications in workflow emails
- Secure access links in notifications
- Expiration handling for shared links

## Success Criteria

✅ **Infrastructure**: S3 bucket properly configured with CORS and lifecycle policies
✅ **Backend**: All API endpoints functional with proper validation
✅ **Frontend**: Complete user interface with error handling
✅ **Security**: File validation and access control implemented
✅ **Performance**: Upload progress and retry mechanisms working
✅ **Integration**: Components work together seamlessly

## Known Limitations (MVP Scope)

1. **File Types**: Only images supported (PDF support in Phase 2)
2. **Virus Scanning**: Structure prepared but not implemented
3. **Advanced Compression**: Basic client-side validation only
4. **Mobile Optimization**: Desktop-first design
5. **Batch Operations**: Single file operations only

## Next Steps for Phase 2

1. Add PDF attachment support
2. Implement virus scanning integration
3. Add image compression and optimization
4. Mobile responsive design improvements
5. Advanced batch operations
6. Workflow-specific attachment permissions
7. Integration with external storage providers

## Deployment Checklist

- [ ] S3 bucket configuration deployed
- [ ] Backend API deployed and tested
- [ ] Frontend components integrated
- [ ] Environment variables configured
- [ ] CORS settings validated
- [ ] Error monitoring enabled
- [ ] Performance monitoring active
- [ ] Security audit completed

This attachment system provides a solid foundation for the MVE project with secure, scalable file upload capabilities that can be enhanced in future iterations.