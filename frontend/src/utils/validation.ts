import { z } from 'zod';

// Recipient validation schema
export const recipientSchema = z.object({
  type: z.enum(['prescriber', 'patient', 'pharmacy', 'other'], {
    message: 'Recipient type is required',
  }),
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  email: z.string().email('Valid email address is required'),
  mobile: z.string().optional().refine((mobile) => {
    if (!mobile) return true; // Optional field
    // Basic phone number validation (can be enhanced)
    const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
    return phoneRegex.test(mobile);
  }, 'Invalid phone number format'),
  npi: z.string().optional().refine((npi) => {
    if (!npi) return true; // Optional field
    // NPI is 10 digits
    return /^\d{10}$/.test(npi);
  }, 'NPI must be 10 digits'),
});

// Workflow creation schema
export const workflowSchema = z.object({
  recipients: z.array(recipientSchema)
    .min(1, 'At least one recipient is required')
    .max(10, 'Maximum 10 recipients allowed')
    .refine((recipients) => {
      // Check for duplicate emails
      const emails = recipients.map(r => r.email.toLowerCase());
      return emails.length === new Set(emails).size;
    }, 'Duplicate email addresses are not allowed'),
});

// File upload validation
export const validateFile = (file: File) => {
  const errors: string[] = [];
  
  // File size validation (25MB limit)
  const maxSize = 25 * 1024 * 1024; // 25MB in bytes
  if (file.size > maxSize) {
    errors.push('File size must be less than 25MB');
  }
  
  // File type validation
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf'
  ];
  
  if (!allowedTypes.includes(file.type)) {
    errors.push('File type must be JPEG, PNG, GIF, or PDF');
  }
  
  // File name validation
  if (file.name.length > 255) {
    errors.push('File name too long');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Form data validation for PDF form fields
export const pdfFormSchema = z.record(z.string(), z.any());

// Email validation utility
export const isValidEmail = (email: string): boolean => {
  return z.string().email().safeParse(email).success;
};

// Phone number formatting utility
export const formatPhoneNumber = (phone: string): string => {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Format as (XXX) XXX-XXXX for US numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  // Return original if not a standard 10-digit number
  return phone;
};

// NPI validation utility
export const isValidNPI = (npi: string): boolean => {
  // NPI is exactly 10 digits
  return /^\d{10}$/.test(npi);
};

export type RecipientFormData = z.infer<typeof recipientSchema>;
export type WorkflowFormData = z.infer<typeof workflowSchema>;