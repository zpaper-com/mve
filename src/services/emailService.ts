import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { WorkflowSession, Recipient, ApiError } from '../types';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    if (config.email.sendgridApiKey) {
      // SendGrid configuration
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: config.email.sendgridApiKey,
        },
      });
    } else {
      // Development/testing configuration using Ethereal Email
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: 'ethereal.user@ethereal.email',
          pass: 'ethereal.pass',
        },
      });
      
      logger.warn('Using Ethereal Email for development - emails will not be delivered');
    }
  }

  // Send workflow notification email
  async sendWorkflowNotification(
    recipient: Recipient,
    session: WorkflowSession,
    isFirst: boolean = false
  ): Promise<void> {
    try {
      const workflowUrl = `${config.server.baseUrl}/workflow/${recipient.uniqueUrl}`;
      
      const emailData = {
        to: recipient.email!,
        from: {
          email: config.email.from,
          name: config.email.fromName,
        },
        subject: this.getNotificationSubject(recipient.recipientType, isFirst),
        html: this.generateNotificationHtml(recipient, session, workflowUrl, isFirst),
        text: this.generateNotificationText(recipient, session, workflowUrl, isFirst),
      };

      await this.transporter.sendMail(emailData);

      logger.info('Workflow notification sent', {
        recipientId: recipient.id,
        recipientEmail: recipient.email,
        sessionId: session.id,
        isFirst,
      });
    } catch (error) {
      logger.error('Failed to send workflow notification', {
        recipientId: recipient.id,
        recipientEmail: recipient.email,
        sessionId: session.id,
        error: (error as Error).message,
      });
      throw new ApiError(500, 'Failed to send notification email');
    }
  }

  // Send workflow completion notification
  async sendWorkflowCompletionNotification(
    session: WorkflowSession,
    completedRecipient: Recipient
  ): Promise<void> {
    try {
      // Notify all recipients that the workflow is complete
      const emailPromises = session.recipients
        .filter(r => r.email)
        .map(async (recipient) => {
          const emailData = {
            to: recipient.email!,
            from: {
              email: config.email.from,
              name: config.email.fromName,
            },
            subject: 'Workflow Completed - MVE System',
            html: this.generateCompletionHtml(recipient, session, completedRecipient),
            text: this.generateCompletionText(recipient, session, completedRecipient),
          };

          return this.transporter.sendMail(emailData);
        });

      await Promise.all(emailPromises);

      logger.info('Workflow completion notifications sent', {
        sessionId: session.id,
        recipientCount: session.recipients.length,
        completedBy: completedRecipient.id,
      });
    } catch (error) {
      logger.error('Failed to send workflow completion notifications', {
        sessionId: session.id,
        error: (error as Error).message,
      });
      // Don't throw error for completion notifications - workflow should continue
    }
  }

  // Send workflow reminder
  async sendWorkflowReminder(recipient: Recipient, session: WorkflowSession): Promise<void> {
    try {
      const workflowUrl = `${config.server.baseUrl}/workflow/${recipient.uniqueUrl}`;
      
      const emailData = {
        to: recipient.email!,
        from: {
          email: config.email.from,
          name: config.email.fromName,
        },
        subject: 'Reminder: Action Required - MVE Workflow',
        html: this.generateReminderHtml(recipient, session, workflowUrl),
        text: this.generateReminderText(recipient, session, workflowUrl),
      };

      await this.transporter.sendMail(emailData);

      logger.info('Workflow reminder sent', {
        recipientId: recipient.id,
        recipientEmail: recipient.email,
        sessionId: session.id,
      });
    } catch (error) {
      logger.error('Failed to send workflow reminder', {
        recipientId: recipient.id,
        recipientEmail: recipient.email,
        sessionId: session.id,
        error: (error as Error).message,
      });
      throw new ApiError(500, 'Failed to send reminder email');
    }
  }

  // Private helper methods
  private getNotificationSubject(recipientType: string, isFirst: boolean): string {
    const prefix = isFirst ? 'New' : 'Next Step';
    
    switch (recipientType.toLowerCase()) {
      case 'prescriber':
        return `${prefix}: Prescription Review Required`;
      case 'patient':
        return `${prefix}: Patient Information Required`;
      case 'pharmacy':
        return `${prefix}: Pharmacy Action Required`;
      case 'insurance':
        return `${prefix}: Insurance Authorization Required`;
      default:
        return `${prefix}: Action Required - MVE Workflow`;
    }
  }

  private generateNotificationHtml(
    recipient: Recipient,
    session: WorkflowSession,
    workflowUrl: string,
    isFirst: boolean
  ): string {
    const stepText = isFirst ? 'new workflow' : 'next step in the workflow';
    const recipientName = recipient.partyName || recipient.email?.split('@')[0] || 'Recipient';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MVE Workflow Notification</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f8f9fa; }
        .button { 
            display: inline-block; 
            background: #3498db; 
            color: white; 
            padding: 12px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
        }
        .footer { 
            background: #ecf0f1; 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #7f8c8d;
        }
        .info-box { 
            background: #e8f4f8; 
            border-left: 4px solid #3498db; 
            padding: 15px; 
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>MVE Workflow System</h1>
            <p>Action Required</p>
        </div>
        
        <div class="content">
            <h2>Hello ${recipientName},</h2>
            
            <p>You have a ${stepText} that requires your attention in the MVE system.</p>
            
            <div class="info-box">
                <strong>Workflow Details:</strong><br>
                Document: Medical Prescription Form<br>
                Your Role: ${recipient.recipientType}<br>
                Step: ${recipient.orderIndex + 1} of ${session.recipients?.length || 1}
            </div>
            
            <p>Please click the button below to access your workflow:</p>
            
            <div style="text-align: center;">
                <a href="${workflowUrl}" class="button">Access Workflow</a>
            </div>
            
            <p><strong>Important:</strong></p>
            <ul>
                <li>This link is unique to you and should not be shared</li>
                <li>The workflow will expire in 48 hours</li>
                <li>Complete your step to allow the next person to proceed</li>
            </ul>
            
            <p>If you have any questions or need assistance, please contact our support team.</p>
            
            <p>Best regards,<br>MVE System Team</p>
        </div>
        
        <div class="footer">
            <p>This is an automated message from the MVE Workflow System.</p>
            <p>If you received this email in error, please ignore it.</p>
        </div>
    </div>
</body>
</html>`;
  }

  private generateNotificationText(
    recipient: Recipient,
    session: WorkflowSession,
    workflowUrl: string,
    isFirst: boolean
  ): string {
    const stepText = isFirst ? 'new workflow' : 'next step in the workflow';
    const recipientName = recipient.partyName || recipient.email?.split('@')[0] || 'Recipient';

    return `
MVE Workflow System - Action Required

Hello ${recipientName},

You have a ${stepText} that requires your attention in the MVE system.

Workflow Details:
- Document: Medical Prescription Form
- Your Role: ${recipient.recipientType}
- Step: ${recipient.orderIndex + 1} of ${session.recipients?.length || 1}

Please access your workflow at: ${workflowUrl}

Important:
- This link is unique to you and should not be shared
- The workflow will expire in 48 hours
- Complete your step to allow the next person to proceed

If you have any questions or need assistance, please contact our support team.

Best regards,
MVE System Team

---
This is an automated message from the MVE Workflow System.
If you received this email in error, please ignore it.`;
  }

  private generateCompletionHtml(
    recipient: Recipient,
    session: WorkflowSession,
    completedRecipient: Recipient
  ): string {
    const recipientName = recipient.partyName || recipient.email?.split('@')[0] || 'Recipient';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow Completed</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #27ae60; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f8f9fa; }
        .success-box { 
            background: #d4edda; 
            border-left: 4px solid #27ae60; 
            padding: 15px; 
            margin: 20px 0;
        }
        .footer { 
            background: #ecf0f1; 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #7f8c8d;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Workflow Completed</h1>
            <p>MVE System</p>
        </div>
        
        <div class="content">
            <h2>Hello ${recipientName},</h2>
            
            <div class="success-box">
                <strong>Great news!</strong> The workflow you participated in has been completed successfully.
            </div>
            
            <p><strong>Workflow Summary:</strong></p>
            <ul>
                <li>Document: Medical Prescription Form</li>
                <li>Total Participants: ${session.recipients?.length || 1}</li>
                <li>Completed by: ${completedRecipient.partyName || completedRecipient.email}</li>
                <li>Completion Date: ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <p>All participants have completed their required steps, and the document is now ready for processing.</p>
            
            <p>Thank you for your participation in the MVE workflow system.</p>
            
            <p>Best regards,<br>MVE System Team</p>
        </div>
        
        <div class="footer">
            <p>This is an automated message from the MVE Workflow System.</p>
        </div>
    </div>
</body>
</html>`;
  }

  private generateCompletionText(
    recipient: Recipient,
    session: WorkflowSession,
    completedRecipient: Recipient
  ): string {
    const recipientName = recipient.partyName || recipient.email?.split('@')[0] || 'Recipient';

    return `
MVE Workflow System - Workflow Completed

Hello ${recipientName},

Great news! The workflow you participated in has been completed successfully.

Workflow Summary:
- Document: Medical Prescription Form
- Total Participants: ${session.recipients?.length || 1}
- Completed by: ${completedRecipient.partyName || completedRecipient.email}
- Completion Date: ${new Date().toLocaleDateString()}

All participants have completed their required steps, and the document is now ready for processing.

Thank you for your participation in the MVE workflow system.

Best regards,
MVE System Team

---
This is an automated message from the MVE Workflow System.`;
  }

  private generateReminderHtml(
    recipient: Recipient,
    session: WorkflowSession,
    workflowUrl: string
  ): string {
    const recipientName = recipient.partyName || recipient.email?.split('@')[0] || 'Recipient';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow Reminder</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f39c12; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f8f9fa; }
        .button { 
            display: inline-block; 
            background: #e67e22; 
            color: white; 
            padding: 12px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
        }
        .warning-box { 
            background: #fff3cd; 
            border-left: 4px solid #f39c12; 
            padding: 15px; 
            margin: 20px 0;
        }
        .footer { 
            background: #ecf0f1; 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #7f8c8d;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⏰ Workflow Reminder</h1>
            <p>MVE System</p>
        </div>
        
        <div class="content">
            <h2>Hello ${recipientName},</h2>
            
            <div class="warning-box">
                <strong>Reminder:</strong> You have a pending workflow step that requires your attention.
            </div>
            
            <p>This is a friendly reminder that you have an incomplete step in the MVE workflow system.</p>
            
            <p><strong>Workflow Details:</strong></p>
            <ul>
                <li>Document: Medical Prescription Form</li>
                <li>Your Role: ${recipient.recipientType}</li>
                <li>Step: ${recipient.orderIndex + 1} of ${session.recipients?.length || 1}</li>
            </ul>
            
            <p>Please complete your step as soon as possible to avoid workflow expiration.</p>
            
            <div style="text-align: center;">
                <a href="${workflowUrl}" class="button">Complete Your Step</a>
            </div>
            
            <p><strong>Important:</strong> This workflow will expire soon if not completed.</p>
            
            <p>Best regards,<br>MVE System Team</p>
        </div>
        
        <div class="footer">
            <p>This is an automated reminder from the MVE Workflow System.</p>
        </div>
    </div>
</body>
</html>`;
  }

  private generateReminderText(
    recipient: Recipient,
    session: WorkflowSession,
    workflowUrl: string
  ): string {
    const recipientName = recipient.partyName || recipient.email?.split('@')[0] || 'Recipient';

    return `
MVE Workflow System - Reminder

Hello ${recipientName},

This is a friendly reminder that you have an incomplete step in the MVE workflow system.

Workflow Details:
- Document: Medical Prescription Form
- Your Role: ${recipient.recipientType}
- Step: ${recipient.orderIndex + 1} of ${session.recipients?.length || 1}

Please complete your step as soon as possible: ${workflowUrl}

Important: This workflow will expire soon if not completed.

Best regards,
MVE System Team

---
This is an automated reminder from the MVE Workflow System.`;
  }

  // Send workflow expiration notification
  async sendWorkflowExpirationNotification(
    recipient: Recipient,
    session: WorkflowSession
  ): Promise<void> {
    try {
      const recipientName = recipient.partyName || recipient.email?.split('@')[0] || 'Recipient';
      
      const emailData = {
        to: recipient.email!,
        from: {
          email: config.email.from,
          name: config.email.fromName,
        },
        subject: 'Workflow Expired - MVE System',
        html: this.generateExpirationHtml(recipient, session),
        text: this.generateExpirationText(recipient, session),
      };

      await this.transporter.sendMail(emailData);

      logger.info('Workflow expiration notification sent', {
        recipientId: recipient.id,
        recipientEmail: recipient.email,
        sessionId: session.id,
      });
    } catch (error) {
      logger.error('Failed to send workflow expiration notification', {
        recipientId: recipient.id,
        recipientEmail: recipient.email,
        sessionId: session.id,
        error: (error as Error).message,
      });
      // Don't throw error for expiration notifications
    }
  }

  // Batch send multiple emails with retry logic
  async batchSendEmails(
    emailTasks: Array<{
      recipient: Recipient;
      session: WorkflowSession;
      type: 'notification' | 'reminder' | 'completion' | 'expiration';
      isFirst?: boolean;
    }>
  ): Promise<void> {
    const batchSize = 10; // SendGrid allows up to 1000 emails per request
    const batches = [];
    
    for (let i = 0; i < emailTasks.length; i += batchSize) {
      batches.push(emailTasks.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const emailPromises = batch.map(async (task) => {
        try {
          switch (task.type) {
            case 'notification':
              return this.sendWorkflowNotification(task.recipient, task.session, task.isFirst);
            case 'reminder':
              return this.sendWorkflowReminder(task.recipient, task.session);
            case 'completion':
              return this.sendWorkflowCompletionNotification(task.session, task.recipient);
            case 'expiration':
              return this.sendWorkflowExpirationNotification(task.recipient, task.session);
            default:
              throw new Error(`Unknown email type: ${task.type}`);
          }
        } catch (error) {
          logger.error('Failed to send email in batch', {
            recipientId: task.recipient.id,
            emailType: task.type,
            error: (error as Error).message,
          });
          // Continue with other emails in batch
        }
      });

      await Promise.allSettled(emailPromises);
      
      // Small delay between batches to avoid rate limiting
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  // Validate email configuration
  async validateConfiguration(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Email service configuration validated successfully');
      return true;
    } catch (error) {
      logger.error('Email service configuration validation failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  private generateExpirationHtml(recipient: Recipient, session: WorkflowSession): string {
    const recipientName = recipient.partyName || recipient.email?.split('@')[0] || 'Recipient';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow Expired</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #e74c3c; color: white; padding: 20px; text-align: center; }
        .content { padding: 30px 20px; background: #f8f9fa; }
        .error-box { 
            background: #f8d7da; 
            border-left: 4px solid #e74c3c; 
            padding: 15px; 
            margin: 20px 0;
        }
        .footer { 
            background: #ecf0f1; 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #7f8c8d;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Workflow Expired</h1>
            <p>MVE System</p>
        </div>
        
        <div class="content">
            <h2>Hello ${recipientName},</h2>
            
            <div class="error-box">
                <strong>Notice:</strong> The workflow you were assigned to has expired due to the 48-hour time limit.
            </div>
            
            <p>Unfortunately, the workflow step assigned to you has expired and is no longer available for completion.</p>
            
            <p><strong>Workflow Details:</strong></p>
            <ul>
                <li>Document: Medical Prescription Form</li>
                <li>Your Role: ${recipient.recipientType}</li>
                <li>Expiration Date: ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <p>If this workflow is still needed, the initiator will need to start a new workflow process.</p>
            
            <p>If you have any questions, please contact our support team.</p>
            
            <p>Best regards,<br>MVE System Team</p>
        </div>
        
        <div class="footer">
            <p>This is an automated message from the MVE Workflow System.</p>
        </div>
    </div>
</body>
</html>`;
  }

  private generateExpirationText(recipient: Recipient, session: WorkflowSession): string {
    const recipientName = recipient.partyName || recipient.email?.split('@')[0] || 'Recipient';

    return `
MVE Workflow System - Workflow Expired

Hello ${recipientName},

The workflow you were assigned to has expired due to the 48-hour time limit.

Workflow Details:
- Document: Medical Prescription Form
- Your Role: ${recipient.recipientType}
- Expiration Date: ${new Date().toLocaleDateString()}

If this workflow is still needed, the initiator will need to start a new workflow process.

If you have any questions, please contact our support team.

Best regards,
MVE System Team

---
This is an automated message from the MVE Workflow System.`;
  }
}