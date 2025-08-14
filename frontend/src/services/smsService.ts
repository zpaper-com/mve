import axios from 'axios';

export interface SendSMSRequest {
  to: string;
  message: string;
  recipientName?: string;
  documentUrl?: string;
}

export interface SendSMSResponse {
  success: boolean;
  messageSid?: string;
  to: string;
  message: string;
  error?: string;
  details?: string;
}

export interface SMSServerStatus {
  status: string;
  timestamp: string;
  twilioConfigured: boolean;
}

export interface TwilioStatus {
  success: boolean;
  accountSid?: string;
  accountName?: string;
  status?: string;
  fromNumber?: string;
  error?: string;
  details?: string;
}

class SMSService {
  private baseURL = '/api';

  /**
   * Send SMS message to a recipient
   */
  async sendSMS(request: SendSMSRequest): Promise<SendSMSResponse> {
    try {
      console.log('📱 Sending SMS:', request);
      
      const response = await axios.post<SendSMSResponse>(`${this.baseURL}/send-sms`, request);
      
      console.log('✅ SMS sent successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to send SMS:', error);
      
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data;
        return {
          success: false,
          to: request.to,
          message: 'Failed to send SMS',
          error: errorData?.error || error.message,
          details: errorData?.details || 'Network error occurred'
        };
      }
      
      return {
        success: false,
        to: request.to,
        message: 'Failed to send SMS',
        error: 'Unknown error occurred',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send workflow notification SMS to a recipient
   */
  async sendWorkflowNotification(
    recipientName: string,
    recipientPhone: string,
    documentUrl?: string,
    customMessage?: string
  ): Promise<SendSMSResponse> {
    const defaultMessage = customMessage || `Please complete your portion of the PDF workflow. You'll receive a unique link to access your form.`;
    
    return this.sendSMS({
      to: recipientPhone,
      message: defaultMessage,
      recipientName,
      documentUrl: documentUrl || 'https://mvepdf.sparks.zpaper.com/pdf'
    });
  }

  /**
   * Check if SMS server is healthy
   */
  async checkServerHealth(): Promise<SMSServerStatus> {
    try {
      const response = await axios.get<SMSServerStatus>(`${this.baseURL}/health`);
      return response.data;
    } catch (error) {
      console.error('❌ SMS server health check failed:', error);
      return {
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        twilioConfigured: false
      };
    }
  }

  /**
   * Check Twilio configuration and credentials
   */
  async checkTwilioStatus(): Promise<TwilioStatus> {
    try {
      const response = await axios.get<TwilioStatus>(`${this.baseURL}/twilio-status`);
      return response.data;
    } catch (error) {
      console.error('❌ Twilio status check failed:', error);
      
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data;
        return {
          success: false,
          error: errorData?.error || error.message,
          details: errorData?.details || 'Network error occurred'
        };
      }
      
      return {
        success: false,
        error: 'Unknown error occurred',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Format phone number for SMS (basic validation)
   */
  formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Add +1 if it's a 10-digit US number
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    
    // Add + if it doesn't have it
    if (digits.length > 10 && !phoneNumber.startsWith('+')) {
      return `+${digits}`;
    }
    
    return phoneNumber;
  }

  /**
   * Validate phone number format
   */
  isValidPhoneNumber(phoneNumber: string): boolean {
    const formatted = this.formatPhoneNumber(phoneNumber);
    // Basic validation for international format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(formatted);
  }
}

export const smsService = new SMSService();
export default smsService;