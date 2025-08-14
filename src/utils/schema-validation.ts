import { z } from 'zod';
import { WorkflowStatus, RecipientStatus, RecipientType } from '@prisma/client';

// Validation schemas for database operations
export const WorkflowStatusSchema = z.nativeEnum(WorkflowStatus);
export const RecipientStatusSchema = z.nativeEnum(RecipientStatus);
export const RecipientTypeSchema = z.nativeEnum(RecipientType);

// Create workflow session validation
export const CreateWorkflowSessionSchema = z.object({
  documentUrl: z.string().url().max(500),
  recipients: z.array(
    z.object({
      recipientType: RecipientTypeSchema,
      partyName: z.string().min(1).max(255).optional(),
      email: z.string().email().max(320).optional(),
      mobile: z.string().max(20).optional(),
      npi: z.string().length(10).optional(),
    })
  ).min(1).max(10), // MVP limit of 10 recipients
  metadata: z.record(z.any()).optional(),
  createdBy: z.string().max(255).optional(),
  expiresAt: z.date().optional(),
});

// Update recipient validation
export const UpdateRecipientSchema = z.object({
  status: RecipientStatusSchema.optional(),
  formData: z.record(z.any()).optional(),
  completedAt: z.date().optional(),
  accessedAt: z.date().optional(),
});

// Create attachment validation
export const CreateAttachmentSchema = z.object({
  sessionId: z.string().uuid(),
  recipientId: z.string().uuid().optional(),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().positive().max(25 * 1024 * 1024), // 25MB max
  s3Key: z.string().min(1).max(500),
  s3Bucket: z.string().min(1).max(100),
  uploadedBy: z.string().uuid().optional(),
  checksum: z.string().max(64).optional(),
});

// Pagination validation
export const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Workflow filter validation
export const WorkflowFilterSchema = z.object({
  status: z.array(WorkflowStatusSchema).optional(),
  createdBy: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  recipientType: z.array(RecipientTypeSchema).optional(),
});

// Form data validation schemas for different recipient types
export const PrescriberFormDataSchema = z.object({
  patientDiagnosis: z.string().min(1).max(500).optional(),
  medications: z.array(
    z.object({
      name: z.string().min(1).max(100),
      dosage: z.string().min(1).max(50),
      frequency: z.string().min(1).max(100),
      duration: z.string().min(1).max(100),
    })
  ).optional(),
  specialInstructions: z.string().max(1000).optional(),
  prescriberSignature: z.string().min(1).max(255).optional(),
  licenseNumber: z.string().min(1).max(50).optional(),
  deaNumber: z.string().min(1).max(20).optional(),
});

export const PatientFormDataSchema = z.object({
  patientConsent: z.boolean().optional(),
  allergies: z.array(z.string().max(100)).max(20).optional(),
  currentMedications: z.array(z.string().max(200)).max(50).optional(),
  emergencyContact: z.object({
    name: z.string().min(1).max(255),
    relationship: z.string().min(1).max(100),
    phone: z.string().min(1).max(20),
  }).optional(),
  insuranceInfo: z.object({
    provider: z.string().min(1).max(255),
    policyNumber: z.string().min(1).max(100),
    groupNumber: z.string().min(1).max(100),
  }).optional(),
  patientSignature: z.string().min(1).max(255).optional(),
  signatureDate: z.string().datetime().optional(),
});

export const PharmacyFormDataSchema = z.object({
  pharmacyName: z.string().min(1).max(255).optional(),
  pharmacyAddress: z.string().min(1).max(500).optional(),
  pharmacyPhone: z.string().min(1).max(20).optional(),
  pharmacyLicense: z.string().min(1).max(50).optional(),
  pharmacistName: z.string().min(1).max(255).optional(),
  dispensedMedications: z.array(
    z.object({
      name: z.string().min(1).max(100),
      strength: z.string().min(1).max(50),
      quantity: z.number().positive(),
      refills: z.number().min(0),
      ndc: z.string().min(1).max(20),
    })
  ).optional(),
  dispensedDate: z.string().datetime().optional(),
  pharmacistSignature: z.string().min(1).max(255).optional(),
});

// Dynamic form data validation based on recipient type
export function validateFormData(recipientType: RecipientType, formData: any) {
  switch (recipientType) {
    case RecipientType.PRESCRIBER:
      return PrescriberFormDataSchema.parse(formData);
    case RecipientType.PATIENT:
      return PatientFormDataSchema.parse(formData);
    case RecipientType.PHARMACY:
      return PharmacyFormDataSchema.parse(formData);
    case RecipientType.INSURANCE:
    case RecipientType.CUSTOM:
      // For insurance and custom types, allow any structure for flexibility
      return z.record(z.any()).parse(formData);
    default:
      throw new Error(`Unsupported recipient type: ${recipientType}`);
  }
}

// Database constraint validation
export function validateDatabaseConstraints() {
  return {
    maxRecipients: 10,
    maxFileSize: 25 * 1024 * 1024, // 25MB
    maxFileNameLength: 255,
    maxEmailLength: 320,
    maxPartyNameLength: 255,
    maxUniqueUrlLength: 100,
    supportedFileTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf', // For Phase 2
    ],
    sessionExpiryDays: 7,
    recipientExpiryHours: 48,
  };
}

// Email validation helper
export const EmailSchema = z.string().email().max(320);

// URL validation helper  
export const URLSchema = z.string().url().max(500);

// UUID validation helper
export const UUIDSchema = z.string().uuid();

// Export validation functions
export const validateEmail = (email: string) => EmailSchema.parse(email);
export const validateURL = (url: string) => URLSchema.parse(url);
export const validateUUID = (uuid: string) => UUIDSchema.parse(uuid);

// Database integrity check functions
export async function validateDatabaseIntegrity(prisma: any) {
  const issues: string[] = [];

  try {
    // Check for orphaned recipients
    const orphanedRecipients = await prisma.recipient.count({
      where: {
        session: null,
      },
    });
    if (orphanedRecipients > 0) {
      issues.push(`Found ${orphanedRecipients} orphaned recipients`);
    }

    // Check for recipients without unique URLs
    const recipientsWithoutUrls = await prisma.recipient.count({
      where: {
        uniqueUrl: null,
      },
    });
    if (recipientsWithoutUrls > 0) {
      issues.push(`Found ${recipientsWithoutUrls} recipients without unique URLs`);
    }

    // Check for invalid workflow progress
    const workflowsWithInvalidProgress = await prisma.workflowSession.count({
      where: {
        OR: [
          {
            completedRecipients: {
              gt: prisma.raw('total_recipients'),
            },
          },
          {
            completedRecipients: {
              lt: 0,
            },
          },
        ],
      },
    });
    if (workflowsWithInvalidProgress > 0) {
      issues.push(`Found ${workflowsWithInvalidProgress} workflows with invalid progress counters`);
    }

    // Check for attachments with missing S3 keys
    const attachmentsWithoutS3Keys = await prisma.attachment.count({
      where: {
        OR: [
          { s3Key: null },
          { s3Key: '' },
        ],
      },
    });
    if (attachmentsWithoutS3Keys > 0) {
      issues.push(`Found ${attachmentsWithoutS3Keys} attachments without S3 keys`);
    }

    return {
      valid: issues.length === 0,
      issues,
      checkedAt: new Date(),
    };
  } catch (error) {
    return {
      valid: false,
      issues: [`Database integrity check failed: ${(error as Error).message}`],
      checkedAt: new Date(),
    };
  }
}