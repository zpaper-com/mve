#!/usr/bin/env tsx

/**
 * Database Setup Script for MVE Project
 * 
 * This script performs complete database setup including:
 * - Schema generation and validation
 * - Migration execution
 * - Performance optimization
 * - Data seeding
 * - Health checks
 * 
 * Usage:
 * npm run db:setup
 * or
 * tsx scripts/setup-database.ts [--force] [--seed] [--verify-only]
 */

import { PrismaClient } from '@prisma/client';
import { config } from '../src/config/env';
import { connectDatabase, checkDatabaseHealth, prisma } from '../src/config/database';
import { MigrationHelper } from '../src/utils/migration-helper';
import { validateDatabaseIntegrity } from '../src/utils/schema-validation';
import { DatabaseUtils } from '../src/utils/database';
import { createDatabaseLogger } from '../src/config/logger';

const logger = createDatabaseLogger();

interface SetupOptions {
  force?: boolean;
  seed?: boolean;
  verifyOnly?: boolean;
  skipBackup?: boolean;
}

async function parseArgs(): Promise<SetupOptions> {
  const args = process.argv.slice(2);
  return {
    force: args.includes('--force'),
    seed: args.includes('--seed'),
    verifyOnly: args.includes('--verify-only'),
    skipBackup: args.includes('--skip-backup'),
  };
}

async function checkPrerequisites(): Promise<void> {
  logger.info('Checking prerequisites...');

  // Check environment variables
  if (!config.database.url) {
    throw new Error('DATABASE_URL is required');
  }

  // Check PostgreSQL version
  try {
    const versionResult = await prisma.$queryRaw<Array<{ version: string }>>`
      SELECT version();
    `;
    const version = versionResult[0]?.version || '';
    logger.info(`PostgreSQL version: ${version}`);

    // Extract version number
    const versionMatch = version.match(/PostgreSQL (\d+\.\d+)/);
    if (versionMatch) {
      const versionNumber = parseFloat(versionMatch[1]);
      if (versionNumber < 13.0) {
        logger.warn(`PostgreSQL version ${versionNumber} detected. Recommended version is 13.0+`);
      }
    }
  } catch (error) {
    throw new Error(`Failed to check PostgreSQL version: ${(error as Error).message}`);
  }

  // Check required extensions
  const extensions = ['uuid-ossp', 'pg_trgm', 'btree_gin'];
  for (const extension of extensions) {
    try {
      await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS ${prisma.raw(`"${extension}"`)};`;
      logger.debug(`Extension ${extension} verified`);
    } catch (error) {
      logger.warn(`Could not enable extension ${extension}: ${(error as Error).message}`);
    }
  }

  logger.info('Prerequisites check completed');
}

async function backupExistingData(): Promise<void> {
  logger.info('Creating backup of existing data...');
  
  const migrationHelper = new MigrationHelper(prisma);
  const backupName = `pre-setup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  
  try {
    await migrationHelper.createDataBackup(backupName);
    logger.info(`Backup created: ${backupName}`);
  } catch (error) {
    logger.warn(`Backup failed: ${(error as Error).message}`);
  }
}

async function runDatabaseMigrations(): Promise<void> {
  logger.info('Running database migrations...');
  
  const migrationHelper = new MigrationHelper(prisma);
  await migrationHelper.runMigrations();
  
  logger.info('Migrations completed');
}

async function initializeDatabase(): Promise<void> {
  logger.info('Initializing database with optimizations...');
  
  const migrationHelper = new MigrationHelper(prisma);
  await migrationHelper.initializeDatabase();
  
  logger.info('Database initialization completed');
}

async function verifyDatabaseSetup(): Promise<void> {
  logger.info('Verifying database setup...');
  
  const migrationHelper = new MigrationHelper(prisma);
  const verification = await migrationHelper.verifyDatabaseSetup();
  
  if (verification.schemaValid) {
    logger.info('✅ Database schema is valid');
  } else {
    logger.error('❌ Database schema validation failed:');
    verification.issues.forEach(issue => logger.error(`  - ${issue}`));
  }
  
  if (verification.performanceOptimized) {
    logger.info('✅ Database performance is optimized');
  } else {
    logger.warn('⚠️  Database performance recommendations:');
    verification.recommendations.forEach(rec => logger.warn(`  - ${rec}`));
  }
  
  // Check database health
  const health = await checkDatabaseHealth();
  logger.info(`Database health: ${health.status} (${health.latency}ms)`);
  
  // Run integrity check
  const integrity = await validateDatabaseIntegrity(prisma);
  if (integrity.valid) {
    logger.info('✅ Database integrity check passed');
  } else {
    logger.warn('⚠️  Database integrity issues found:');
    integrity.issues.forEach(issue => logger.warn(`  - ${issue}`));
  }
}

async function seedDatabase(): Promise<void> {
  logger.info('Seeding database with sample data...');
  
  // Import and run the seed script
  const { main: runSeed } = await import('../prisma/seed');
  await runSeed();
  
  logger.info('Database seeding completed');
}

async function displayDatabaseStats(): Promise<void> {
  logger.info('Database Statistics:');
  
  const stats = await DatabaseUtils.getWorkflowStats();
  logger.info(`  Total Workflows: ${stats.totalWorkflows}`);
  logger.info(`  Status Breakdown:`, stats.statusBreakdown);
  logger.info(`  Recipient Types:`, stats.recipientTypeBreakdown);
  logger.info(`  Attachments: ${stats.attachments.total} (${Math.round(stats.attachments.totalSize / 1024 / 1024)}MB total)`);
  
  // Performance metrics
  const migrationHelper = new MigrationHelper(prisma);
  try {
    const metrics = await migrationHelper.getPerformanceMetrics();
    logger.info(`  Active Connections: ${metrics.connections}`);
    logger.info(`  Cache Hit Ratio: ${metrics.cacheHitRatio}%`);
  } catch (error) {
    logger.warn('Could not retrieve performance metrics:', (error as Error).message);
  }
}

async function setupDatabase(options: SetupOptions): Promise<void> {
  const startTime = Date.now();
  
  try {
    logger.info('🚀 Starting MVE Database Setup');
    logger.info(`Environment: ${config.server.nodeEnv}`);
    logger.info(`Database URL: ${config.database.url.replace(/:[^:@]*@/, ':***@')}`);
    
    // Connect to database
    await connectDatabase();
    
    // Check prerequisites
    await checkPrerequisites();
    
    if (options.verifyOnly) {
      await verifyDatabaseSetup();
      return;
    }
    
    // Create backup if not skipped
    if (!options.skipBackup) {
      await backupExistingData();
    }
    
    // Run migrations
    await runDatabaseMigrations();
    
    // Initialize database
    await initializeDatabase();
    
    // Verify setup
    await verifyDatabaseSetup();
    
    // Seed database if requested
    if (options.seed) {
      await seedDatabase();
    }
    
    // Display final stats
    await displayDatabaseStats();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`✅ Database setup completed successfully in ${duration}s`);
    
  } catch (error) {
    logger.error('❌ Database setup failed:', (error as Error).message);
    logger.error('Stack trace:', (error as Error).stack);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const options = await parseArgs();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
  });
  
  try {
    await setupDatabase(options);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the setup if this script is executed directly
if (require.main === module) {
  main();
}

export { setupDatabase, parseArgs };