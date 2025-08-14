import { z } from 'zod';

// Common validation patterns
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
const npiRegex = /^\d{10}$/;

// Base schemas
export const EmailSchema = z
  .string()
  .min(1, 'Email is required')
  .regex(emailRegex, 'Invalid email format');

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const PhoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .regex(phoneRegex, 'Invalid phone number format');

export const NPISchema = z
  .string()
  .regex(npiRegex, 'NPI must be exactly 10 digits');

// Auth schemas
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

export const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: EmailSchema,
  password: PasswordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  acceptTerms: z.boolean().refine(val => val === true, 'You must accept the terms and conditions'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

export const ResetPasswordSchema = z.object({
  password: PasswordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  token: z.string().min(1, 'Reset token is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: PasswordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Profile schemas
export const ProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: EmailSchema,
  phone: PhoneSchema.optional(),
  npi: NPISchema.optional(),
  title: z.string().optional(),
  organization: z.string().optional(),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
});

// Workflow schemas
export const RecipientSchema = z.object({
  type: z.enum(['provider', 'patient', 'admin'], {
    required_error: 'Recipient type is required',
  }),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: EmailSchema,
  mobile: PhoneSchema.optional(),
  npi: NPISchema.optional(),
  orderIndex: z.number().min(0),
});

export const CreateWorkflowSchema = z.object({
  documentName: z.string().min(1, 'Document name is required'),
  documentUrl: z.string().url('Invalid document URL'),
  recipients: z.array(RecipientSchema)
    .min(1, 'At least one recipient is required')
    .max(3, 'Maximum 3 recipients allowed for MVP'),
  expiresIn: z.number().min(1, 'Expiration time must be at least 1 hour').max(168, 'Maximum 168 hours (7 days)').optional(),
  sendNotifications: z.boolean().default(true),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((data) => {
  // Validate unique email addresses
  const emails = data.recipients.map(r => r.email.toLowerCase());
  return emails.length === new Set(emails).size;
}, {
  message: "Recipient email addresses must be unique",
  path: ["recipients"],
});

// Contact/Support schemas
export const ContactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: EmailSchema,
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
  category: z.enum(['bug', 'feature', 'support', 'other'], {
    required_error: 'Please select a category',
  }),
});

// File upload schemas
export const FileUploadSchema = z.object({
  files: z.array(z.instanceof(File))
    .min(1, 'At least one file is required')
    .max(5, 'Maximum 5 files allowed'),
}).refine((data) => {
  // Validate file sizes (25MB max per file)
  const maxSize = 25 * 1024 * 1024; // 25MB in bytes
  return data.files.every(file => file.size <= maxSize);
}, {
  message: "Each file must be less than 25MB",
  path: ["files"],
}).refine((data) => {
  // Validate file types (images only for MVP)
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return data.files.every(file => allowedTypes.includes(file.type));
}, {
  message: "Only image files (JPEG, PNG, GIF, WebP) are allowed",
  path: ["files"],
});

// Search schemas
export const SearchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  filters: z.object({
    status: z.array(z.enum(['draft', 'active', 'completed', 'cancelled', 'expired'])).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    createdBy: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// PDF form field schemas
export const PDFFormFieldSchema = z.object({
  name: z.string().min(1, 'Field name is required'),
  type: z.enum(['text', 'checkbox', 'radio', 'select', 'signature', 'date']),
  value: z.unknown().optional(),
  required: z.boolean().default(false),
  readonly: z.boolean().default(false),
  page: z.number().min(1),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(0),
  height: z.number().min(0),
  options: z.array(z.string()).optional(),
  validation: z.object({
    pattern: z.string().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
});

// Export types inferred from schemas
export type LoginFormData = z.infer<typeof LoginSchema>;
export type RegisterFormData = z.infer<typeof RegisterSchema>;
export type ForgotPasswordFormData = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof ResetPasswordSchema>;
export type ChangePasswordFormData = z.infer<typeof ChangePasswordSchema>;
export type ProfileFormData = z.infer<typeof ProfileSchema>;
export type CreateWorkflowFormData = z.infer<typeof CreateWorkflowSchema>;
export type ContactFormData = z.infer<typeof ContactSchema>;
export type FileUploadFormData = z.infer<typeof FileUploadSchema>;
export type SearchFormData = z.infer<typeof SearchSchema>;
export type PDFFormFieldData = z.infer<typeof PDFFormFieldSchema>;
export type RecipientFormData = z.infer<typeof RecipientSchema>;