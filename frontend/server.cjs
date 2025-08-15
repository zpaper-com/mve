const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const fetch = require('node-fetch');
const mustache = require('mustache');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('./database.cjs');
const PDFFormFillerService = require('./services/pdfFormFiller.cjs');
const AuditDocumentService = require('./services/auditDocumentService.cjs');
require('dotenv').config({ path: '../.env' });

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp_originalname
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    cb(null, `${uniqueSuffix}_${baseName}${ext}`);
  }
});

// File filter to only allow images and PDFs
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images (JPEG, PNG, GIF, WebP) and PDF files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB limit
  }
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// Create and serve completed forms directory
const completedFormsDir = path.join(__dirname, 'completed_forms');
if (!fs.existsSync(completedFormsDir)) {
  fs.mkdirSync(completedFormsDir, { recursive: true });
}
app.use('/completed_forms', express.static(completedFormsDir));

// Create and serve audit documents directory
const auditDocumentsDir = path.join(__dirname, 'audit_documents');
if (!fs.existsSync(auditDocumentsDir)) {
  fs.mkdirSync(auditDocumentsDir, { recursive: true });
}
app.use('/audit_documents', express.static(auditDocumentsDir));

// Initialize Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Initialize database
const db = new Database();

// Initialize PDF form filler service
const pdfFiller = new PDFFormFillerService();

// Initialize audit document service
const auditService = new AuditDocumentService();

// Initialize database on startup
async function initializeDatabase() {
  try {
    await db.init();
    console.log('🗄️ Database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }
}

// Helper function to generate UUIDs
function generateWorkflowUUID() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Helper function to get workflow with all form data
async function getWorkflowWithFormData(workflowId) {
  try {
    // Get workflow directly from database
    const workflow = await new Promise((resolve, reject) => {
      db.db.get(`SELECT * FROM workflows WHERE id = ?`, [workflowId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!workflow) return null;
    
    // Add form data history from all recipients
    const recipients = await db.getRecipientsByWorkflow(workflowId);
    console.log(`📊 Found ${recipients.length} recipients for workflow ${workflowId}`);
    
    workflow.formDataHistory = recipients
      .filter(r => {
        const hasData = r.form_data && r.status === 'completed';
        if (hasData) {
          console.log(`  ✓ Recipient "${r.recipient_name}" has form data (status: ${r.status})`);
        } else {
          console.log(`  ✗ Recipient "${r.recipient_name}" - form_data: ${!!r.form_data}, status: ${r.status}`);
        }
        return hasData;
      })
      .map(r => {
        const parsedData = typeof r.form_data === 'string' ? JSON.parse(r.form_data) : r.form_data;
        console.log(`    → Parsed ${Object.keys(parsedData).length} fields for ${r.recipient_name}`);
        return {
          recipient_name: r.recipient_name,
          recipient_type: r.recipient_type,
          form_data: parsedData,
          submitted_at: r.submitted_at
        };
      });
    
    return workflow;
  } catch (error) {
    console.error('Error getting workflow with form data:', error);
    return null;
  }
}

// Send completed documents to recipients who opted in
async function sendCompletedDocumentsToRecipients(workflowId) {
  try {
    // Get all recipients for this workflow
    const recipients = await db.getRecipientsByWorkflow(workflowId);
    
    // Get workflow details
    const workflow = await new Promise((resolve, reject) => {
      db.db.get(`SELECT * FROM workflows WHERE id = ?`, [workflowId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!workflow || !workflow.completed_pdf_path) {
      console.warn('⚠️ No completed PDF available for distribution');
      return;
    }
    
    // Filter recipients who opted in for documents
    const recipientsForPdf = recipients.filter(r => r.send_completed_pdf);
    const recipientsForAudit = recipients.filter(r => r.send_audit_doc);
    
    console.log(`📬 Sending completed PDF to ${recipientsForPdf.length} recipients`);
    console.log(`📋 Sending audit document to ${recipientsForAudit.length} recipients`);
    
    const baseUrl = 'https://mvepdf.sparks.zpaper.com';
    const pdfUrl = `${baseUrl}${workflow.completed_pdf_path}`;
    
    // Send completed PDF emails
    for (const recipient of recipientsForPdf) {
      if (recipient.email) {
        try {
          const emailResponse = await fetch('http://localhost:3001/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: recipient.email,
              subject: 'Completed PDF Document - MVE Workflow',
              body: `Dear ${recipient.recipient_name},\n\nThe workflow you participated in has been completed. You can download the completed PDF document using the link below:\n\n${pdfUrl}\n\nThank you for your participation.`,
              recipientName: recipient.recipient_name,
              workflowUrl: pdfUrl,
              workflowId: workflowId
            })
          });
          
          if (emailResponse.ok) {
            console.log(`✅ Sent completed PDF to ${recipient.recipient_name} (${recipient.email})`);
          } else {
            console.warn(`⚠️ Failed to send completed PDF to ${recipient.recipient_name}`);
          }
        } catch (error) {
          console.error(`❌ Error sending completed PDF to ${recipient.recipient_name}:`, error);
        }
      }
    }
    
    // Send audit document PDF
    const auditUrl = workflow.audit_doc_path ? `${baseUrl}${workflow.audit_doc_path}` : null;
    
    for (const recipient of recipientsForAudit) {
      if (recipient.email) {
        try {
          const auditBody = auditUrl ? 
            `Dear ${recipient.recipient_name},\n\nThe workflow you participated in has been completed. You can download the comprehensive audit document using the link below:\n\n${auditUrl}\n\nThis audit document contains detailed information about all participants, form data, and the complete workflow history.\n\nThank you for your participation.` :
            `Dear ${recipient.recipient_name},\n\nThe workflow you participated in has been completed. Unfortunately, the audit document is currently being generated and will be available shortly.\n\nThank you for your participation.`;
            
          const emailResponse = await fetch('http://localhost:3001/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: recipient.email,
              subject: 'Workflow Audit Document - MVE Workflow',
              body: auditBody,
              recipientName: recipient.recipient_name,
              workflowUrl: auditUrl || pdfUrl,
              workflowId: workflowId
            })
          });
          
          if (emailResponse.ok) {
            console.log(`✅ Sent audit document to ${recipient.recipient_name} (${recipient.email})`);
          } else {
            console.warn(`⚠️ Failed to send audit document to ${recipient.recipient_name}`);
          }
        } catch (error) {
          console.error(`❌ Error sending audit document to ${recipient.recipient_name}:`, error);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error sending completed documents:', error);
  }
}

// Generate audit document for workflow
async function generateAuditDocument(workflowId) {
  try {
    console.log(`📋 Generating audit document for workflow: ${workflowId}`);
    
    // Get workflow data with all form submissions
    const workflowData = await getWorkflowWithFormData(workflowId);
    
    if (!workflowData) {
      console.error(`❌ Workflow ${workflowId} not found for audit generation`);
      return null;
    }
    
    console.log(`📊 Found workflow data with ${workflowData.formDataHistory ? workflowData.formDataHistory.length : 0} form submissions for audit`);
    
    // Get additional workflow details including recipients and attachments
    const recipients = await db.getRecipientsByWorkflow(workflowId);
    const attachments = await db.getAttachmentsByWorkflow(workflowId);
    
    // Enhance workflow data for audit
    const enhancedWorkflowData = {
      ...workflowData,
      attachments: attachments,
      formDataHistory: recipients.map(r => ({
        recipient_name: r.recipient_name,
        recipient_type: r.recipient_type,
        status: r.status,
        submitted_at: r.submitted_at,
        form_data: r.form_data ? (typeof r.form_data === 'string' ? JSON.parse(r.form_data) : r.form_data) : null
      }))
    };
    
    // Generate the audit document
    const auditDocPath = await auditService.generateAuditDocument(enhancedWorkflowData, workflowId);
    
    // Get relative path for serving
    const relativePath = auditService.getRelativePath(auditDocPath);
    
    // Update database with audit document path
    await db.updateWorkflowAuditDoc(workflowId, relativePath);
    
    console.log(`✅ Audit document generated and saved: ${relativePath}`);
    
    return auditDocPath;
  } catch (error) {
    console.error(`❌ Error generating audit document for workflow ${workflowId}:`, error);
    console.error('Stack trace:', error.stack);
    return null;
  }
}

// Generate completed PDF for workflow
async function generateCompletedPDF(workflowId) {
  try {
    console.log(`🔧 Generating completed PDF for workflow: ${workflowId}`);
    
    // Get workflow data with all form submissions
    const workflowData = await getWorkflowWithFormData(workflowId);
    
    if (!workflowData) {
      console.error(`❌ Workflow ${workflowId} not found`);
      return;
    }
    
    console.log(`📋 Found workflow data with ${workflowData.formDataHistory ? workflowData.formDataHistory.length : 0} form submissions`);
    console.log(`📄 Document URL: ${workflowData.document_url || workflowData.documentUrl}`);
    
    // Generate the filled and flattened PDF
    const completedPdfPath = await pdfFiller.fillAndFlattenPDF(
      workflowData.document_url || workflowData.documentUrl,
      workflowData,
      workflowId
    );
    
    // Get relative path for serving
    const relativePath = pdfFiller.getRelativePath(completedPdfPath);
    
    // Update database with completed PDF path
    await db.updateWorkflowCompletedPDF(workflowId, relativePath);
    
    console.log(`✅ Completed PDF generated and saved: ${relativePath}`);
    
  } catch (error) {
    console.error(`❌ Error generating completed PDF for workflow ${workflowId}:`, error);
    console.error('Stack trace:', error.stack);
  }
}

// Email endpoint
app.post('/api/send-email', async (req, res) => {
  try {
    const { email, subject, body, recipientName, workflowUrl, workflowId } = req.body;

    if (!email || !subject || !body) {
      return res.status(400).json({
        error: 'Missing required fields: email, subject, and body are required'
      });
    }

    // Get email template and render with mustache
    let emailBody, emailSubject;
    try {
      const template = await db.getTemplate('email_workflow_notification');
      if (template) {
        const templateData = {
          recipientName: recipientName || 'there',
          body: body || 'Please complete your portion of the PDF workflow.',
          workflowUrl: workflowUrl || 'https://mvepdf.sparks.zpaper.com/pdf'
        };
        
        // Disable HTML escaping for plain text email
        const originalEscape = mustache.escape;
        mustache.escape = function(text) { return text; };
        
        emailBody = mustache.render(template.content, templateData);
        emailSubject = template.subject ? mustache.render(template.subject, templateData) : subject;
        
        // Restore original escape function
        mustache.escape = originalEscape;
      } else {
        // Fallback to original format if template not found
        emailBody = `
Hi ${recipientName || 'there'},

You've been added to a PDF workflow for completion.

${body}

Access your workflow: ${workflowUrl || 'https://mvepdf.sparks.zpaper.com/pdf'}

Best regards,
MVE PDF Workflow System
`.trim();
        emailSubject = subject;
      }
    } catch (templateError) {
      console.warn('⚠️ Failed to load email template, using fallback:', templateError);
      emailBody = `
Hi ${recipientName || 'there'},

You've been added to a PDF workflow for completion.

${body}

Access your workflow: ${workflowUrl || 'https://mvepdf.sparks.zpaper.com/pdf'}

Best regards,
MVE PDF Workflow System
`.trim();
      emailSubject = subject;
    }

    // Save notification to database first
    let notificationId = null;
    if (workflowId) {
      try {
        const notification = await db.saveNotification({
          workflowId: workflowId,
          type: 'email',
          recipientAddress: email,
          subject: emailSubject,
          message: emailBody,
          status: 'pending'
        });
        notificationId = notification.id;
      } catch (dbError) {
        console.warn('⚠️ Failed to save email notification to database:', dbError);
      }
    }

    // Send email using Node-RED API
    const emailResponse = await fetch('https://qa190.zpaper.com/r/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        subject: emailSubject,
        body: emailBody
      })
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      const error = new Error(`Email API error: ${emailResponse.status} - ${errorData}`);
      
      // Update notification status to failed
      if (notificationId) {
        try {
          await db.updateNotificationStatus(notificationId, 'failed', null, error.message);
        } catch (dbError) {
          console.warn('⚠️ Failed to update notification status:', dbError);
        }
      }
      
      throw error;
    }

    const result = await emailResponse.json();

    // Update notification status to sent
    if (notificationId) {
      try {
        await db.updateNotificationStatus(notificationId, 'sent', result.messageId || 'email-sent');
      } catch (dbError) {
        console.warn('⚠️ Failed to update notification status:', dbError);
      }
    }

    console.log(`✅ Email sent successfully to ${email}`);
    console.log(`📧 Subject: ${emailSubject}`);

    res.json({
      success: true,
      email: email,
      subject: emailSubject,
      message: 'Email sent successfully',
      notificationId: notificationId
    });

  } catch (error) {
    console.error('❌ Error sending email:', error);
    
    res.status(500).json({
      error: 'Failed to send email',
      details: error.message
    });
  }
});

// SMS endpoint
app.post('/api/send-sms', async (req, res) => {
  try {
    const { to, message, recipientName, documentUrl, workflowId, workflowUuid } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        error: 'Missing required fields: to and message are required'
      });
    }

    // Use provided workflow UUID or generate a new one
    const uuid = workflowUuid || generateWorkflowUUID();
    const baseUrl = 'https://mvepdf.sparks.zpaper.com';
    const workflowUrl = `${baseUrl}/s/${uuid}`;

    // Get SMS template and render with mustache
    let smsMessage;
    try {
      const template = await db.getTemplate('sms_workflow_notification');
      if (template) {
        const templateData = {
          recipientName: recipientName || 'there',
          message: message || 'Please complete your portion of the PDF workflow.',
          workflowUrl: workflowUrl
        };
        
        // Disable HTML escaping for plain text SMS
        const originalEscape = mustache.escape;
        mustache.escape = function(text) { return text; };
        
        smsMessage = mustache.render(template.content, templateData);
        
        // Restore original escape function
        mustache.escape = originalEscape;
      } else {
        // Fallback to original format if template not found
        smsMessage = `
Hi ${recipientName || 'there'}!

You've been added to a PDF workflow for completion.

${message}

Access your workflow: ${workflowUrl}

This is an automated message from MVE PDF Workflow System.
`.trim();
      }
    } catch (templateError) {
      console.warn('⚠️ Failed to load SMS template, using fallback:', templateError);
      smsMessage = `
Hi ${recipientName || 'there'}!

You've been added to a PDF workflow for completion.

${message}

Access your workflow: ${workflowUrl}

This is an automated message from MVE PDF Workflow System.
`.trim();
    }

    // Save notification to database first
    let notificationId = null;
    if (workflowId) {
      try {
        const notification = await db.saveNotification({
          workflowId: workflowId,
          type: 'sms',
          recipientAddress: to,
          message: smsMessage,
          status: 'pending'
        });
        notificationId = notification.id;
      } catch (dbError) {
        console.warn('⚠️ Failed to save SMS notification to database:', dbError);
      }
    }

    // Send SMS using Twilio
    const twilioMessage = await client.messages.create({
      body: smsMessage,
      from: process.env.TWILIO_FROM_NUMBER,
      to: to
    });

    // Update notification status to sent
    if (notificationId) {
      try {
        await db.updateNotificationStatus(notificationId, 'sent', twilioMessage.sid);
      } catch (dbError) {
        console.warn('⚠️ Failed to update notification status:', dbError);
      }
    }

    console.log(`✅ SMS sent successfully to ${to}`);
    console.log(`📱 Message SID: ${twilioMessage.sid}`);

    res.json({
      success: true,
      messageSid: twilioMessage.sid,
      to: to,
      workflowUuid: uuid,
      message: 'SMS sent successfully',
      notificationId: notificationId
    });

  } catch (error) {
    console.error('❌ Error sending SMS:', error);
    
    // Update notification status to failed if we have an ID
    if (req.body.workflowId) {
      const notificationId = null; // We don't have the ID in the error case
      try {
        if (notificationId) {
          await db.updateNotificationStatus(notificationId, 'failed', null, error.message);
        }
      } catch (dbError) {
        console.warn('⚠️ Failed to update notification status:', dbError);
      }
    }
    
    res.status(500).json({
      error: 'Failed to send SMS',
      details: error.message
    });
  }
});

// Create workflow endpoint
app.post('/api/workflows', async (req, res) => {
  try {
    const { recipients, documentUrl, metadata, initialFormData } = req.body;
    console.log('📥 Received workflow request with initialFormData:', initialFormData ? 'YES' : 'NO');
    if (initialFormData) {
      console.log('📋 Initial form data keys:', Object.keys(initialFormData));
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        error: 'Recipients array is required and must not be empty'
      });
    }

    // Generate UUID for the workflow
    const workflowUuid = generateWorkflowUUID();
    
    // Create workflow in database
    const workflow = await db.createWorkflow(workflowUuid, documentUrl, metadata);
    
    // Add recipients to database
    const savedRecipients = [];
    for (let i = 0; i < recipients.length; i++) {
      const recipientData = {
        recipientName: recipients[i].partyName,
        email: recipients[i].email,
        mobile: recipients[i].mobile,
        recipientType: recipients[i].recipientType || 'PRESCRIBER',
        orderIndex: i,
        sendCompletedPdf: recipients[i].sendCompletedPdf || false,
        sendAuditDoc: recipients[i].sendAuditDoc || false
      };
      
      const savedRecipient = await db.addRecipient(workflow.id, recipientData);
      savedRecipients.push(savedRecipient);
      
      // Save initial form data to the first recipient if provided
      if (i === 0 && initialFormData && Object.keys(initialFormData).length > 0) {
        try {
          // Pass false for updateSubmittedAt since this is initial data, not a submission
          await db.updateRecipientFormData(savedRecipient.id, initialFormData, false);
          console.log(`📋 Initial form data saved for first recipient ${savedRecipient.recipientName}:`, initialFormData);
        } catch (formDataError) {
          console.warn('⚠️ Failed to save initial form data:', formDataError);
        }
      }
    }

    console.log(`✅ Workflow created: ${workflow.id} (UUID: ${workflowUuid})`);
    console.log(`👥 Recipients added: ${savedRecipients.length}`);
    if (initialFormData && Object.keys(initialFormData).length > 0) {
      console.log(`📋 Initial form data included: ${Object.keys(initialFormData).length} fields`);
    }

    res.json({
      success: true,
      workflow: {
        id: workflow.id,
        uuid: workflowUuid,
        documentUrl: workflow.documentUrl,
        recipients: savedRecipients,
        metadata: workflow.metadata
      },
      workflowUrl: `https://mvepdf.sparks.zpaper.com/s/${workflowUuid}`,
      recipientUrls: savedRecipients.map(r => ({
        recipientName: r.recipientName,
        token: r.uniqueToken,
        url: `https://mvepdf.sparks.zpaper.com/s/${r.uniqueToken}`
      }))
    });

  } catch (error) {
    console.error('❌ Error creating workflow:', error);
    
    res.status(500).json({
      error: 'Failed to create workflow',
      details: error.message
    });
  }
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }

    const { workflowId, recipientId, uploadedBy } = req.body;

    if (!workflowId) {
      return res.status(400).json({
        error: 'Workflow ID is required'
      });
    }

    // Save attachment to database
    const attachmentData = {
      workflowId,
      recipientId: recipientId || null,
      originalFilename: req.file.originalname,
      storedFilename: req.file.filename,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: uploadedBy || 'unknown'
    };

    const savedAttachment = await db.saveAttachment(attachmentData);

    console.log(`📎 File uploaded: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)}MB)`);

    res.json({
      success: true,
      attachment: {
        id: savedAttachment.id,
        originalFilename: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        url: `/uploads/${req.file.filename}`,
        uploadedBy: uploadedBy
      }
    });

  } catch (error) {
    console.error('❌ Error uploading file:', error);
    
    // Clean up uploaded file if database save failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Failed to upload file',
      details: error.message
    });
  }
});

// Get attachments for a workflow
app.get('/api/workflows/:workflowId/attachments', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    const attachments = await db.getAttachmentsByWorkflow(workflowId);
    
    // Add full URL to each attachment
    const attachmentsWithUrls = attachments.map(attachment => ({
      ...attachment,
      url: `/uploads/${attachment.stored_filename}`
    }));
    
    res.json({
      success: true,
      attachments: attachmentsWithUrls
    });
    
  } catch (error) {
    console.error('❌ Error getting attachments:', error);
    
    res.status(500).json({
      error: 'Failed to get attachments',
      details: error.message
    });
  }
});

// Get specific attachment
app.get('/api/attachments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const attachment = await db.getAttachmentById(id);
    
    if (!attachment) {
      return res.status(404).json({
        error: 'Attachment not found'
      });
    }
    
    const filePath = path.join(uploadsDir, attachment.stored_filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found on disk'
      });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.original_filename}"`);
    
    // Send file
    res.sendFile(filePath);
    
  } catch (error) {
    console.error('❌ Error serving attachment:', error);
    
    res.status(500).json({
      error: 'Failed to serve attachment',
      details: error.message
    });
  }
});

// Get recipient by token endpoint  
app.get('/api/recipients/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        error: 'Recipient token is required'
      });
    }

    // Get recipient from database
    const recipient = await db.getRecipientByToken(token);
    
    if (!recipient) {
      return res.status(404).json({
        error: 'Recipient not found'
      });
    }

    // Get all recipients for this workflow to determine position
    const allRecipients = await db.getRecipientsByWorkflow(recipient.workflow_id);
    const sortedRecipients = allRecipients.sort((a, b) => a.order_index - b.order_index);
    
    const currentIndex = sortedRecipients.findIndex(r => r.id === recipient.id);
    const isLastRecipient = currentIndex === sortedRecipients.length - 1;

    console.log(`🔑 Recipient lookup: ${recipient.recipient_name} (${currentIndex + 1}/${sortedRecipients.length})`);

    res.json({
      success: true,
      recipient: {
        id: recipient.id,
        name: recipient.recipient_name,
        email: recipient.email,
        mobile: recipient.mobile,
        recipientType: recipient.recipient_type,
        orderIndex: recipient.order_index,
        status: recipient.status,
        uniqueToken: recipient.unique_token,
        workflow: {
          id: recipient.workflow_id,
          uuid: recipient.workflow_uuid,
          documentUrl: recipient.document_url,
          status: recipient.workflow_status
        },
        position: {
          current: currentIndex,
          total: sortedRecipients.length,
          isLast: isLastRecipient
        }
      }
    });

  } catch (error) {
    console.error('❌ Error looking up recipient:', error);
    
    res.status(500).json({
      error: 'Failed to lookup recipient',
      details: error.message
    });
  }
});

// Get workflow by UUID endpoint
app.get('/api/workflows/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;

    if (!uuid) {
      return res.status(400).json({
        error: 'Workflow UUID is required'
      });
    }

    // Get workflow from database
    const workflow = await db.getWorkflowByUuid(uuid);
    
    if (!workflow) {
      return res.status(404).json({
        error: 'Workflow not found'
      });
    }

    // Get recipients and notifications
    const [recipients, notifications] = await Promise.all([
      db.getRecipientsByWorkflow(workflow.id),
      db.getNotificationsByWorkflow(workflow.id)
    ]);

    console.log(`📋 Workflow lookup: ${workflow.id} (UUID: ${uuid})`);

    res.json({
      success: true,
      workflow: {
        id: workflow.id,
        uuid: workflow.uuid,
        documentUrl: workflow.document_url,
        status: workflow.status,
        createdAt: workflow.created_at,
        updatedAt: workflow.updated_at,
        metadata: workflow.metadata,
        recipients: recipients,
        notifications: notifications
      }
    });

  } catch (error) {
    console.error('❌ Error looking up workflow:', error);
    
    res.status(500).json({
      error: 'Failed to lookup workflow',
      details: error.message
    });
  }
});

// Submit recipient portion endpoint
app.post('/api/recipients/:token/submit', async (req, res) => {
  try {
    const { token } = req.params;
    const { formData } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Recipient token is required'
      });
    }

    // Get recipient from database
    const recipient = await db.getRecipientByToken(token);
    
    if (!recipient) {
      return res.status(404).json({
        error: 'Recipient not found'
      });
    }

    if (recipient.status !== 'pending') {
      return res.status(400).json({
        error: 'Recipient has already submitted their portion'
      });
    }

    // Save form data if provided
    if (formData && Object.keys(formData).length > 0) {
      await db.updateRecipientFormData(recipient.id, formData);
      console.log(`📋 Form data saved for ${recipient.recipient_name}:`, formData);
    }

    // Update recipient status to completed
    await db.updateRecipientStatus(recipient.id, 'completed');

    // Get next pending recipient
    const nextRecipient = await db.getNextPendingRecipient(recipient.workflow_id, recipient.order_index);
    
    let workflowCompleted = false;
    if (nextRecipient) {
      // Send notification to next recipient
      const baseUrl = 'https://mvepdf.sparks.zpaper.com';
      const nextRecipientUrl = `${baseUrl}/s/${nextRecipient.unique_token}`;
      
      console.log(`📬 Sending notification to next recipient: ${nextRecipient.recipient_name}`);
      console.log(`🔗 Next recipient URL: ${nextRecipientUrl}`);
      
      // Send email notification
      if (nextRecipient.email) {
        try {
          const emailResponse = await fetch('http://localhost:3001/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: nextRecipient.email,
              subject: 'PDF Workflow - Your Turn to Complete',
              body: 'Please complete your portion of the PDF workflow.',
              recipientName: nextRecipient.recipient_name,
              workflowUrl: nextRecipientUrl,
              workflowId: recipient.workflow_id
            })
          });
        } catch (emailError) {
          console.warn('⚠️ Failed to send email to next recipient:', emailError);
        }
      }

      // Send SMS notification
      if (nextRecipient.mobile) {
        try {
          const smsResponse = await fetch('http://localhost:3001/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: nextRecipient.mobile,
              message: 'Please complete your portion of the PDF workflow.',
              recipientName: nextRecipient.recipient_name,
              workflowId: recipient.workflow_id,
              workflowUuid: nextRecipient.unique_token
            })
          });
        } catch (smsError) {
          console.warn('⚠️ Failed to send SMS to next recipient:', smsError);
        }
      }
    } else {
      // No more recipients - workflow is complete
      workflowCompleted = true;
      
      // Update workflow status to completed
      try {
        await db.updateWorkflowStatus(recipient.workflow_id, 'completed');
        console.log(`✅ Workflow ${recipient.workflow_id} marked as completed in database!`);
        
        // Generate completed PDF form
        console.log(`🔧 Starting PDF form generation for completed workflow ${recipient.workflow_id}`);
        await generateCompletedPDF(recipient.workflow_id);
        
        // Generate audit document
        console.log(`📋 Starting audit document generation for completed workflow ${recipient.workflow_id}`);
        await generateAuditDocument(recipient.workflow_id);
        
        // Send completed PDF and audit document to recipients who opted in
        console.log(`📧 Checking for recipients who want completed documents...`);
        await sendCompletedDocumentsToRecipients(recipient.workflow_id);
        
      } catch (statusError) {
        console.warn('⚠️ Failed to update workflow status to completed:', statusError);
      }
      
      console.log(`✅ Workflow ${recipient.workflow_id} completed!`);
    }

    console.log(`✅ Recipient ${recipient.recipient_name} submitted their portion`);

    res.json({
      success: true,
      message: workflowCompleted ? 'Workflow completed successfully!' : 'Submission successful, next recipient notified',
      workflowCompleted,
      workflowId: recipient.workflow_id, // Include workflowId for webhook triggering
      nextRecipient: nextRecipient ? {
        name: nextRecipient.recipient_name,
        email: nextRecipient.email
      } : null
    });

  } catch (error) {
    console.error('❌ Error submitting recipient portion:', error);
    
    res.status(500).json({
      error: 'Failed to submit recipient portion',
      details: error.message
    });
  }
});

// Get workflow statistics endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getWorkflowStats();
    
    res.json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('❌ Error getting stats:', error);
    
    res.status(500).json({
      error: 'Failed to get statistics',
      details: error.message
    });
  }
});

// Process existing completed workflows to generate PDFs
app.post('/api/admin/process-completed-pdfs', async (req, res) => {
  try {
    console.log('🔄 Processing existing completed workflows to generate PDFs...');
    
    await pdfFiller.processExistingCompletedWorkflows(async () => {
      return await db.getCompletedWorkflows();
    });
    
    res.json({
      success: true,
      message: 'Completed workflows processed successfully'
    });
    
  } catch (error) {
    console.error('❌ Error processing completed workflows:', error);
    
    res.status(500).json({
      error: 'Failed to process completed workflows',
      details: error.message
    });
  }
});

// Post workflow to webhook endpoint
app.post('/api/admin/webhook-post/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    console.log('🔗 Posting webhook for workflow:', workflowId);
    
    // Get the workflow data
    let workflowData = null;
    
    // Get all workflows and find the matching one
    const allWorkflows = await new Promise((resolve, reject) => {
      db.db.all(`SELECT * FROM workflows WHERE id = ?`, [workflowId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    if (allWorkflows.length === 0) {
      return res.status(404).json({
        error: 'Workflow not found'
      });
    }
    
    workflowData = allWorkflows[0];
    
    // Get form data history
    workflowData.formDataHistory = await db.getWorkflowFormData(workflowId);
    
    if (!workflowData) {
      return res.status(404).json({
        error: 'Workflow not found'
      });
    }
    
    if (workflowData.status !== 'completed') {
      return res.status(400).json({
        error: 'Workflow must be completed to post webhook'
      });
    }
    
    if (!workflowData.completed_pdf_path) {
      return res.status(400).json({
        error: 'Completed PDF not found for workflow'
      });
    }
    
    // Read the PDF file
    const pdfPath = path.join(__dirname, workflowData.completed_pdf_path.replace('/', ''));
    
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        error: 'PDF file not found on disk'
      });
    }
    
    const FormData = require('form-data');
    const form = new FormData();
    
    // Add the PDF file
    form.append('pdf', fs.createReadStream(pdfPath), {
      filename: `workflow_${workflowData.uuid}_completed.pdf`,
      contentType: 'application/pdf'
    });
    
    // Add the workflow data as JSON
    const webhookData = {
      workflow: {
        id: workflowData.id,
        uuid: workflowData.uuid,
        status: workflowData.status,
        document_url: workflowData.document_url,
        created_at: workflowData.created_at,
        updated_at: workflowData.updated_at,
        completed_at: workflowData.updated_at
      },
      formDataHistory: workflowData.formDataHistory || [],
      recipients: await db.getRecipientsByWorkflow(workflowId),
      notifications: await db.getNotificationsByWorkflow(workflowId),
      attachments: await db.getAttachmentsByWorkflow(workflowId)
    };
    
    form.append('metadata', JSON.stringify(webhookData), {
      contentType: 'application/json'
    });
    
    // Post to the webhook URL
    const webhookUrl = 'https://qa190.zpaper.com/r/sparks/agent';
    
    console.log('🚀 Sending webhook to:', webhookUrl);
    
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      throw new Error(`Webhook failed: ${webhookResponse.status} - ${errorText}`);
    }
    
    const result = await webhookResponse.text();
    
    console.log('✅ Webhook posted successfully:', result);
    
    res.json({
      success: true,
      message: 'Webhook posted successfully',
      webhookResponse: result
    });
    
  } catch (error) {
    console.error('❌ Error posting webhook:', error);
    
    res.status(500).json({
      error: 'Failed to post webhook',
      details: error.message
    });
  }
});

// Admin: Regenerate PDFs for completed workflows
app.post('/api/admin/regenerate-pdfs', async (req, res) => {
  try {
    // Get all completed workflows without PDFs
    const completedWorkflows = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT * FROM workflows WHERE status = 'completed' AND (completed_pdf_path IS NULL OR completed_pdf_path = '')`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    console.log(`📋 Found ${completedWorkflows.length} completed workflows without PDFs`);
    
    const results = [];
    for (const workflow of completedWorkflows) {
      console.log(`🔧 Regenerating PDF for workflow: ${workflow.id}`);
      try {
        await generateCompletedPDF(workflow.id);
        results.push({ id: workflow.id, status: 'success' });
      } catch (error) {
        console.error(`❌ Failed to generate PDF for workflow ${workflow.id}:`, error);
        results.push({ id: workflow.id, status: 'failed', error: error.message });
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${completedWorkflows.length} workflows`,
      results: results
    });
  } catch (error) {
    console.error('❌ Error regenerating PDFs:', error);
    res.status(500).json({
      error: 'Failed to regenerate PDFs',
      details: error.message
    });
  }
});

// Admin: Generate audit documents for all completed workflows
app.post('/api/admin/generate-audit-docs', async (req, res) => {
  try {
    // Get all completed workflows
    const completedWorkflows = await new Promise((resolve, reject) => {
      db.db.all(
        `SELECT * FROM workflows WHERE status = 'completed'`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    console.log(`📋 Found ${completedWorkflows.length} completed workflows to generate audit documents for`);
    
    const results = [];
    for (const workflow of completedWorkflows) {
      console.log(`📄 Generating audit document for workflow: ${workflow.id}`);
      try {
        await generateAuditDocument(workflow.id);
        results.push({ id: workflow.id, uuid: workflow.uuid, status: 'success' });
      } catch (error) {
        console.error(`❌ Failed to generate audit document for workflow ${workflow.id}:`, error);
        results.push({ id: workflow.id, uuid: workflow.uuid, status: 'failed', error: error.message });
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${completedWorkflows.length} workflows`,
      results: results,
      generated: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length
    });
  } catch (error) {
    console.error('❌ Error generating audit documents:', error);
    res.status(500).json({
      error: 'Failed to generate audit documents',
      details: error.message
    });
  }
});

// Clear all workflows endpoint
app.delete('/api/admin/workflows', async (req, res) => {
  try {
    console.log('🗑️ Clearing all workflows, recipients, and notifications...');
    
    // Delete in order to maintain referential integrity
    await new Promise((resolve, reject) => {
      db.db.serialize(() => {
        db.db.run('DELETE FROM notifications', [], (err) => {
          if (err) reject(err);
        });
        db.db.run('DELETE FROM recipients', [], (err) => {
          if (err) reject(err);
        });
        db.db.run('DELETE FROM workflows', [], (err) => {
          if (err) reject(err);
        });
        db.db.run('DELETE FROM sqlite_sequence WHERE name IN ("recipients", "notifications")', [], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    console.log('✅ All workflows cleared successfully');

    res.json({
      success: true,
      message: 'All workflows, recipients, and notifications cleared successfully'
    });

  } catch (error) {
    console.error('❌ Error clearing workflows:', error);
    
    res.status(500).json({
      error: 'Failed to clear workflows',
      details: error.message
    });
  }
});

// Get workflow form data endpoint
app.get('/api/workflows/:workflowId/form-data', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    const formDataHistory = await db.getWorkflowFormData(workflowId);
    
    res.json({
      success: true,
      formDataHistory: formDataHistory
    });
    
  } catch (error) {
    console.error('❌ Error getting workflow form data:', error);
    
    res.status(500).json({
      error: 'Failed to get workflow form data',
      details: error.message
    });
  }
});

// Admin endpoints
app.get('/api/admin/workflows', async (req, res) => {
  try {
    // Get all workflows with their recipients and notifications
    const allWorkflows = await new Promise((resolve, reject) => {
      db.db.all(`SELECT * FROM workflows ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    const workflowsWithDetails = await Promise.all(
      allWorkflows.map(async (workflow) => {
        const [recipients, notifications, attachments, formDataHistory] = await Promise.all([
          db.getRecipientsByWorkflow(workflow.id),
          db.getNotificationsByWorkflow(workflow.id),
          db.getAttachmentsByWorkflow(workflow.id),
          db.getWorkflowFormData(workflow.id)
        ]);
        
        // Add URLs to attachments
        const attachmentsWithUrls = attachments.map(attachment => ({
          ...attachment,
          url: `/uploads/${attachment.stored_filename}`
        }));
        
        return {
          ...workflow,
          metadata: workflow.metadata ? JSON.parse(workflow.metadata) : {},
          recipients,
          notifications,
          attachments: attachmentsWithUrls,
          formDataHistory: formDataHistory
        };
      })
    );

    res.json({
      success: true,
      workflows: workflowsWithDetails
    });

  } catch (error) {
    console.error('❌ Error getting admin workflows:', error);
    
    res.status(500).json({
      error: 'Failed to get workflows',
      details: error.message
    });
  }
});

app.get('/api/templates', async (req, res) => {
  try {
    const templates = await db.getTemplates();
    
    res.json({
      success: true,
      templates: templates
    });

  } catch (error) {
    console.error('❌ Error getting templates:', error);
    
    res.status(500).json({
      error: 'Failed to get templates',
      details: error.message
    });
  }
});

app.put('/api/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const templateData = { id, ...req.body };
    
    await db.saveTemplate(templateData);
    
    res.json({
      success: true,
      message: 'Template updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating template:', error);
    
    res.status(500).json({
      error: 'Failed to update template',
      details: error.message
    });
  }
});


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER)
  });
});

// Test endpoint to verify Twilio credentials
app.get('/api/twilio-status', async (req, res) => {
  try {
    // Fetch account details to verify credentials
    const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    
    res.json({
      success: true,
      accountSid: account.sid,
      accountName: account.friendlyName,
      status: account.status,
      fromNumber: process.env.TWILIO_FROM_NUMBER
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to verify Twilio credentials',
      details: error.message
    });
  }
});

// Start server after initializing database
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(port, () => {
      console.log(`🚀 SMS Server running on http://localhost:${port}`);
      console.log(`📱 Twilio configured: ${!!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)}`);
      console.log(`📞 From number: ${process.env.TWILIO_FROM_NUMBER || 'Not configured'}`);
      console.log(`🗄️ Database: SQLite (mve_workflows.db)`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📴 Shutting down server...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n📴 Shutting down server...');
  db.close();
  process.exit(0);
});

startServer();