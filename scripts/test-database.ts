#!/usr/bin/env tsx

/**
 * Database Connection Test Script
 * 
 * Tests basic database connectivity and functionality
 */

import { connectDatabase, checkDatabaseHealth, prisma } from '../src/config/database';
import { DatabaseUtils, generateUniqueUrl } from '../src/utils/database';
import { RecipientType } from '@prisma/client';
import { createDatabaseLogger } from '../src/config/logger';

const logger = createDatabaseLogger();

async function testBasicConnection(): Promise<void> {
  logger.info('Testing basic database connection...');
  
  try {
    await connectDatabase();
    const health = await checkDatabaseHealth();
    
    if (health.status === 'healthy') {
      logger.info(`✅ Database connection healthy (${health.latency}ms)`);
    } else {
      throw new Error('Database health check failed');
    }
  } catch (error) {
    logger.error('❌ Database connection failed:', (error as Error).message);
    throw error;
  }
}

async function testBasicQueries(): Promise<void> {
  logger.info('Testing basic database queries...');
  
  try {
    // Test count queries
    const counts = await Promise.all([
      prisma.workflowSession.count(),
      prisma.recipient.count(),
      prisma.attachment.count(),
      prisma.workflowAuditLog.count(),
    ]);
    
    logger.info('Table counts:', {
      workflow_sessions: counts[0],
      recipients: counts[1],
      attachments: counts[2],
      workflow_audit_logs: counts[3],
    });
    
    // Test utility functions
    const uniqueUrl = generateUniqueUrl();
    logger.info('Generated unique URL:', uniqueUrl);
    
    // Test database statistics
    const stats = await DatabaseUtils.getWorkflowStats();
    logger.info('Database statistics retrieved successfully');
    
    logger.info('✅ Basic database queries working');
  } catch (error) {
    logger.error('❌ Database queries failed:', (error as Error).message);
    throw error;
  }
}

async function testCRUDOperations(): Promise<void> {
  logger.info('Testing CRUD operations...');
  
  try {
    // Create a test workflow session
    const testWorkflow = await DatabaseUtils.createWorkflowSession({
      documentUrl: 'https://example.com/test.pdf',
      recipients: [
        {
          recipientType: RecipientType.PRESCRIBER,
          partyName: 'Test Doctor',
          email: 'test@example.com',
        },
      ],
      metadata: { test: true },
      createdBy: 'test-script',
    });
    
    logger.info(`✅ Created test workflow: ${testWorkflow.id}`);
    
    // Read the workflow back
    const retrievedWorkflow = await DatabaseUtils.getWorkflowSession(testWorkflow.id);
    if (!retrievedWorkflow) {
      throw new Error('Failed to retrieve created workflow');
    }
    
    logger.info('✅ Retrieved workflow successfully');
    
    // Update recipient status
    const recipient = retrievedWorkflow.recipients[0];
    if (recipient) {
      await DatabaseUtils.updateRecipientProgress(recipient.id, {
        status: recipient.status,
        formData: { testField: 'testValue' },
      });
      
      logger.info('✅ Updated recipient successfully');
    }
    
    // Clean up test data
    await prisma.workflowSession.delete({
      where: { id: testWorkflow.id },
    });
    
    logger.info('✅ Cleaned up test data');
    logger.info('✅ CRUD operations working correctly');
  } catch (error) {
    logger.error('❌ CRUD operations failed:', (error as Error).message);
    throw error;
  }
}

async function testIndexPerformance(): Promise<void> {
  logger.info('Testing index performance...');
  
  try {
    const startTime = Date.now();
    
    // Test critical queries that should use indexes
    await Promise.all([
      // Test recipient URL lookup (most critical)
      prisma.recipient.findMany({
        where: {
          uniqueUrl: 'nonexistent-url-for-test',
        },
        take: 1,
      }),
      // Test workflow status query
      prisma.workflowSession.findMany({
        where: {
          status: 'ACTIVE',
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      }),
      // Test session-recipient join
      prisma.workflowSession.findMany({
        include: {
          recipients: {
            where: {
              status: 'PENDING',
            },
          },
        },
        take: 5,
      }),
    ]);
    
    const queryTime = Date.now() - startTime;
    logger.info(`✅ Index queries completed in ${queryTime}ms`);
    
    if (queryTime > 1000) {
      logger.warn('⚠️  Index queries took longer than expected - consider optimization');
    }
  } catch (error) {
    logger.error('❌ Index performance test failed:', (error as Error).message);
    throw error;
  }
}

async function runDatabaseTests(): Promise<void> {
  const startTime = Date.now();
  
  try {
    logger.info('🧪 Starting Database Tests...');
    
    await testBasicConnection();
    await testBasicQueries();
    await testCRUDOperations();
    await testIndexPerformance();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`✅ All database tests passed in ${duration}s`);
    
  } catch (error) {
    logger.error('❌ Database tests failed:', (error as Error).message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runDatabaseTests();
}

export { runDatabaseTests };