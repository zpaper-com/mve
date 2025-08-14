import { PrismaClient, WorkflowStatus, RecipientStatus, RecipientType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { encode } from 'base32-encode';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

function generateUniqueUrl(): string {
  const buffer = randomBytes(20); // 160 bits
  return encode(buffer, 'RFC4648', { padding: false }).toLowerCase();
}

// Sample form data for different recipient types
const SAMPLE_PRESCRIBER_FORM_DATA = {
  patientDiagnosis: 'Hypertension',
  medications: [
    {
      name: 'Lisinopril',
      dosage: '10mg',
      frequency: 'once daily',
      duration: '30 days'
    }
  ],
  specialInstructions: 'Take with food. Monitor blood pressure.',
  prescriberSignature: 'Dr. John Smith, MD',
  licenseNumber: 'MD123456',
  deaNumber: 'AB1234567'
};

const SAMPLE_PATIENT_FORM_DATA = {
  patientConsent: true,
  allergies: ['Penicillin', 'Aspirin'],
  currentMedications: ['Metformin 500mg'],
  emergencyContact: {
    name: 'John Doe',
    relationship: 'Spouse',
    phone: '+1987654321'
  },
  insuranceInfo: {
    provider: 'BlueCross BlueShield',
    policyNumber: 'BC123456789',
    groupNumber: 'GRP001'
  },
  patientSignature: 'Jane Doe',
  signatureDate: new Date().toISOString()
};

const SAMPLE_PHARMACY_FORM_DATA = {
  pharmacyName: 'Central Pharmacy',
  pharmacyAddress: '123 Main St, Anytown, USA 12345',
  pharmacyPhone: '+1555123456',
  pharmacyLicense: 'PH789012',
  pharmacistName: 'Dr. Sarah Johnson, PharmD',
  dispensedMedications: [
    {
      name: 'Lisinopril',
      strength: '10mg',
      quantity: 30,
      refills: 2,
      ndc: '0002-0065-30'
    }
  ],
  dispensedDate: new Date().toISOString(),
  pharmacistSignature: 'Dr. Sarah Johnson, PharmD'
};

async function main(): Promise<void> {
  console.log('🌱 Starting database seed...');

  // Clean existing data in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Cleaning existing data...');
    await prisma.workflowAuditLog.deleteMany();
    await prisma.attachment.deleteMany();
    await prisma.recipient.deleteMany();
    await prisma.workflowSession.deleteMany();
  }

  // Create multiple sample workflow sessions with different statuses
  const activeWorkflowSession = await prisma.workflowSession.create({
    data: {
      id: uuidv4(),
      documentUrl: 'https://qr.md/kb/books/merx.pdf',
      status: WorkflowStatus.ACTIVE,
      totalRecipients: 3,
      completedRecipients: 0,
      currentRecipientOrder: 0,
      createdBy: 'development@example.com',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      metadata: {
        documentType: 'prescription',
        priority: 'high',
        patientId: 'P001',
        prescriberId: 'DR001',
        createdBy: 'system',
        source: 'seed',
        version: '1.0'
      },
    },
  });

  const completedWorkflowSession = await prisma.workflowSession.create({
    data: {
      id: uuidv4(),
      documentUrl: 'https://qr.md/kb/books/merx.pdf',
      status: WorkflowStatus.COMPLETED,
      totalRecipients: 2,
      completedRecipients: 2,
      createdBy: 'development@example.com',
      lastAccess: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      metadata: {
        documentType: 'prescription',
        priority: 'medium',
        patientId: 'P002',
        prescriberId: 'DR002',
        completedAt: new Date().toISOString(),
        source: 'seed',
        version: '1.0'
      },
    },
  });

  console.log(`✅ Created active workflow session: ${activeWorkflowSession.id}`);
  console.log(`✅ Created completed workflow session: ${completedWorkflowSession.id}`);

  // Create recipients for active workflow
  const activeRecipients = await Promise.all([
    prisma.recipient.create({
      data: {
        id: uuidv4(),
        sessionId: activeWorkflowSession.id,
        orderIndex: 0,
        recipientType: RecipientType.PRESCRIBER,
        partyName: 'Dr. John Smith',
        email: 'dr.smith@example.com',
        npi: '1234567890',
        uniqueUrl: generateUniqueUrl(),
        status: RecipientStatus.IN_PROGRESS,
        accessedAt: new Date(),
        emailSentAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        formData: SAMPLE_PRESCRIBER_FORM_DATA,
      },
    }),
    prisma.recipient.create({
      data: {
        id: uuidv4(),
        sessionId: activeWorkflowSession.id,
        orderIndex: 1,
        recipientType: RecipientType.PATIENT,
        partyName: 'Jane Doe',
        email: 'jane.doe@example.com',
        mobile: '+1234567890',
        uniqueUrl: generateUniqueUrl(),
        status: RecipientStatus.PENDING,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours from now
      },
    }),
    prisma.recipient.create({
      data: {
        id: uuidv4(),
        sessionId: activeWorkflowSession.id,
        orderIndex: 2,
        recipientType: RecipientType.PHARMACY,
        partyName: 'Central Pharmacy',
        email: 'orders@centralpharmacy.com',
        uniqueUrl: generateUniqueUrl(),
        status: RecipientStatus.PENDING,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours from now
      },
    }),
  ]);

  // Create recipients for completed workflow
  const completedRecipients = await Promise.all([
    prisma.recipient.create({
      data: {
        id: uuidv4(),
        sessionId: completedWorkflowSession.id,
        orderIndex: 0,
        recipientType: RecipientType.PRESCRIBER,
        partyName: 'Dr. Sarah Wilson',
        email: 'dr.wilson@example.com',
        npi: '9876543210',
        uniqueUrl: generateUniqueUrl(),
        status: RecipientStatus.COMPLETED,
        accessedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        emailSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        formData: SAMPLE_PRESCRIBER_FORM_DATA,
      },
    }),
    prisma.recipient.create({
      data: {
        id: uuidv4(),
        sessionId: completedWorkflowSession.id,
        orderIndex: 1,
        recipientType: RecipientType.PATIENT,
        partyName: 'Robert Johnson',
        email: 'robert.johnson@example.com',
        mobile: '+1987654321',
        uniqueUrl: generateUniqueUrl(),
        status: RecipientStatus.COMPLETED,
        accessedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        emailSentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        formData: SAMPLE_PATIENT_FORM_DATA,
      },
    }),
  ]);

  const allRecipients = [...activeRecipients, ...completedRecipients];

  console.log(`✅ Created ${allRecipients.length} recipients`);

  // Create sample attachments for both workflows
  const attachments = await Promise.all([
    // Attachments for active workflow
    prisma.attachment.create({
      data: {
        id: uuidv4(),
        sessionId: activeWorkflowSession.id,
        recipientId: activeRecipients[0].id,
        fileName: 'prescription-notes.pdf',
        fileType: 'application/pdf',
        fileSize: 1024000, // 1MB
        s3Key: `documents/${activeWorkflowSession.id}/attachments/prescription-notes.pdf`,
        s3Bucket: 'mve-documents-dev',
        uploadedBy: activeRecipients[0].id,
        checksum: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
        scanStatus: 'clean',
        downloadCount: 2,
        lastDownload: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      },
    }),
    prisma.attachment.create({
      data: {
        id: uuidv4(),
        sessionId: activeWorkflowSession.id,
        fileName: 'patient-insurance-card.jpg',
        fileType: 'image/jpeg',
        fileSize: 512000, // 512KB
        s3Key: `documents/${activeWorkflowSession.id}/attachments/insurance-card.jpg`,
        s3Bucket: 'mve-documents-dev',
        checksum: 'b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1',
        scanStatus: 'clean',
        downloadCount: 1,
      },
    }),
    // Attachments for completed workflow
    prisma.attachment.create({
      data: {
        id: uuidv4(),
        sessionId: completedWorkflowSession.id,
        recipientId: completedRecipients[0].id,
        fileName: 'completed-prescription.pdf',
        fileType: 'application/pdf',
        fileSize: 2048000, // 2MB
        s3Key: `documents/${completedWorkflowSession.id}/attachments/completed-prescription.pdf`,
        s3Bucket: 'mve-documents-dev',
        uploadedBy: completedRecipients[0].id,
        checksum: 'c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2',
        scanStatus: 'clean',
        downloadCount: 5,
        lastDownload: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      },
    }),
  ]);

  // Create audit log entries
  const auditLogs = await Promise.all([
    prisma.workflowAuditLog.create({
      data: {
        sessionId: activeWorkflowSession.id,
        recipientId: activeRecipients[0].id,
        eventType: 'WORKFLOW_CREATED',
        eventData: {
          totalRecipients: 3,
          documentUrl: activeWorkflowSession.documentUrl,
          createdBy: 'system'
        },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }),
    prisma.workflowAuditLog.create({
      data: {
        sessionId: activeWorkflowSession.id,
        recipientId: activeRecipients[0].id,
        eventType: 'RECIPIENT_ACCESSED',
        eventData: {
          recipientType: 'PRESCRIBER',
          accessMethod: 'email_link'
        },
        ipAddress: '192.168.1.101',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }),
    prisma.workflowAuditLog.create({
      data: {
        sessionId: completedWorkflowSession.id,
        eventType: 'WORKFLOW_COMPLETED',
        eventData: {
          totalDuration: '2 days',
          completedRecipients: 2
        },
        ipAddress: '192.168.1.102',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
  ]);

  console.log(`✅ Created ${attachments.length} attachments`);
  console.log(`✅ Created ${auditLogs.length} audit log entries`);

  console.log('🌱 Database seed completed successfully!');
  console.log('\n📋 Sample Data Created:');
  console.log('\n🔄 Active Workflow:');
  console.log(`   Session ID: ${activeWorkflowSession.id}`);
  console.log(`   Status: ${activeWorkflowSession.status}`);
  console.log(`   Progress: ${activeWorkflowSession.completedRecipients}/${activeWorkflowSession.totalRecipients}`);
  console.log('   Recipients:');
  activeRecipients.forEach((recipient, index) => {
    console.log(`     ${index + 1}. ${recipient.partyName} (${recipient.recipientType})`);
    console.log(`        Status: ${recipient.status}`);
    console.log(`        URL: ${recipient.uniqueUrl}`);
    console.log(`        Email: ${recipient.email}`);
  });

  console.log('\n✅ Completed Workflow:');
  console.log(`   Session ID: ${completedWorkflowSession.id}`);
  console.log(`   Status: ${completedWorkflowSession.status}`);
  console.log(`   Progress: ${completedWorkflowSession.completedRecipients}/${completedWorkflowSession.totalRecipients}`);
  console.log('   Recipients:');
  completedRecipients.forEach((recipient, index) => {
    console.log(`     ${index + 1}. ${recipient.partyName} (${recipient.recipientType})`);
    console.log(`        Status: ${recipient.status}`);
    console.log(`        URL: ${recipient.uniqueUrl}`);
    console.log(`        Email: ${recipient.email}`);
  });

  console.log('\n📎 Attachments:');
  attachments.forEach((attachment, index) => {
    console.log(`   ${index + 1}. ${attachment.fileName} (${attachment.fileSize} bytes)`);
    console.log(`      Type: ${attachment.fileType}`);
    console.log(`      Downloads: ${attachment.downloadCount}`);
  });

  console.log('\n🔍 Performance Test Data:');
  console.log('   - Multiple workflow states (active, completed)');
  console.log('   - Different recipient statuses for testing');
  console.log('   - JSONB form data for query optimization testing');
  console.log('   - Audit logs for monitoring queries');
  console.log('   - Attachments with metadata for S3 operations');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });