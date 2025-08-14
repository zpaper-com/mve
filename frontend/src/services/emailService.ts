import axios from 'axios';

export interface SendEmailRequest {
  email: string;
  subject: string;
  body: string;
  recipientName?: string;
  workflowUrl?: string;
}

export interface SendEmailResponse {
  success: boolean;
  email: string;
  subject: string;
  message: string;
  error?: string;
  details?: string;
}

class EmailService {
  private baseURL = '/api';

  /**
   * Send email message to a recipient
   */
  async sendEmail(request: SendEmailRequest): Promise<SendEmailResponse> {
    try {
      
      const response = await axios.post<SendEmailResponse>(`${this.baseURL}/send-email`, request);
      
      return response.data;
    } catch (error) {
      console.error('Failed to send email:', error);
      
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data;
        return {
          success: false,
          email: request.email,
          subject: request.subject,
          message: 'Failed to send email',
          error: errorData?.error || error.message,
          details: errorData?.details || 'Network error occurred'
        };
      }
      
      return {
        success: false,
        email: request.email,
        subject: request.subject,
        message: 'Failed to send email',
        error: 'Unknown error occurred',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send workflow notification email to a recipient
   */
  async sendWorkflowNotification(
    recipientName: string,
    recipientEmail: string,
    workflowUrl?: string,
    customMessage?: string
  ): Promise<SendEmailResponse> {
    const baseUrl = 'https://mvepdf.sparks.zpaper.com';
    const fullWorkflowUrl = workflowUrl?.startsWith('http') 
      ? workflowUrl 
      : `${baseUrl}${workflowUrl || '/pdf'}`;

    const subject = 'PDF Workflow - Action Required';
    const defaultMessage = customMessage || `Please complete your portion of the PDF workflow. You can access the document using the link provided below.`;
    
    return this.sendEmail({
      email: recipientEmail,
      subject,
      body: defaultMessage,
      recipientName,
      workflowUrl: fullWorkflowUrl
    });
  }

  /**
   * Send workflow completion notification
   */
  async sendCompletionNotification(
    recipientEmail: string,
    workflowId: string,
    completedBy: string
  ): Promise<SendEmailResponse> {
    const subject = 'PDF Workflow Completed';
    const body = `The PDF workflow has been completed by ${completedBy}. All participants have finished their portions of the form.`;
    
    return this.sendEmail({
      email: recipientEmail,
      subject,
      body,
      workflowUrl: `https://mvepdf.sparks.zpaper.com/s/${workflowId}`
    });
  }

  /**
   * Send workflow reminder email
   */
  async sendReminderNotification(
    recipientName: string,
    recipientEmail: string,
    workflowUrl: string,
    hoursRemaining: number = 24
  ): Promise<SendEmailResponse> {
    const subject = 'Reminder: PDF Workflow - Action Required';
    const body = `This is a reminder that you have a PDF workflow waiting for completion. You have approximately ${hoursRemaining} hours remaining to complete your portion.`;
    
    return this.sendEmail({
      email: recipientEmail,
      subject,
      body,
      recipientName,
      workflowUrl
    });
  }

  /**
   * Validate email address format
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export const emailService = new EmailService();
export default emailService;