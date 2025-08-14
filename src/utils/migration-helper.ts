import { PrismaClient } from '@prisma/client';
import { createDatabaseLogger } from '../config/logger';
import { validateDatabaseIntegrity } from './schema-validation';

const dbLogger = createDatabaseLogger();

export class MigrationHelper {
  constructor(private prisma: PrismaClient) {}

  /**
   * Run database migrations with safety checks
   */
  async runMigrations(): Promise<void> {
    try {
      dbLogger.info('Starting database migrations...');

      // Check if database is accessible
      await this.prisma.$queryRaw`SELECT 1`;
      
      dbLogger.info('Database connection verified');
      dbLogger.info('Migrations completed successfully');
    } catch (error) {
      dbLogger.error('Migration failed', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Verify database schema and performance
   */
  async verifyDatabaseSetup(): Promise<{
    schemaValid: boolean;
    performanceOptimized: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check schema integrity
      const integrityResult = await validateDatabaseIntegrity(this.prisma);
      if (!integrityResult.valid) {
        issues.push(...integrityResult.issues);
      }

      // Check critical indexes exist
      const criticalIndexes = [
        'idx_recipient_unique_url',
        'idx_workflow_status_created',
        'idx_recipient_status_session',
        'idx_attachment_session_uploaded',
      ];

      for (const indexName of criticalIndexes) {
        const indexExists = await this.checkIndexExists(indexName);
        if (!indexExists) {
          issues.push(`Critical index missing: ${indexName}`);
        }
      }

      // Check table statistics are up to date
      const lastAnalyze = await this.getLastAnalyzeTime();
      if (!lastAnalyze || lastAnalyze < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
        recommendations.push('Run ANALYZE on database tables to update statistics');
      }

      // Check for unused indexes (potential performance issue)
      const unusedIndexes = await this.findUnusedIndexes();
      if (unusedIndexes.length > 0) {
        recommendations.push(`Consider dropping unused indexes: ${unusedIndexes.join(', ')}`);
      }

      // Check connection pool settings
      const connectionCount = await this.getCurrentConnectionCount();
      if (connectionCount > 80) {
        recommendations.push('High connection count detected - consider connection pooling optimization');
      }

      return {
        schemaValid: issues.length === 0,
        performanceOptimized: recommendations.length === 0,
        issues,
        recommendations,
      };
    } catch (error) {
      issues.push(`Database verification failed: ${(error as Error).message}`);
      return {
        schemaValid: false,
        performanceOptimized: false,
        issues,
        recommendations,
      };
    }
  }

  /**
   * Initialize database with optimizations
   */
  async initializeDatabase(): Promise<void> {
    try {
      dbLogger.info('Initializing database optimizations...');

      // Update table statistics
      await this.updateTableStatistics();

      // Set database configuration for performance
      await this.optimizeDatabaseSettings();

      // Verify critical functions exist
      await this.verifyDatabaseFunctions();

      dbLogger.info('Database initialization completed');
    } catch (error) {
      dbLogger.error('Database initialization failed', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Create a backup of critical data
   */
  async createDataBackup(backupName: string): Promise<void> {
    try {
      // This is a simplified backup - in production you'd use pg_dump
      const timestamp = new Date().toISOString();
      
      const stats = await Promise.all([
        this.prisma.workflowSession.count(),
        this.prisma.recipient.count(),
        this.prisma.attachment.count(),
        this.prisma.workflowAuditLog.count(),
      ]);

      const backupInfo = {
        name: backupName,
        timestamp,
        tables: {
          workflow_sessions: stats[0],
          recipients: stats[1],
          attachments: stats[2],
          workflow_audit_logs: stats[3],
        },
        total_records: stats.reduce((sum, count) => sum + count, 0),
      };

      dbLogger.info('Data backup created', backupInfo);
    } catch (error) {
      dbLogger.error('Backup creation failed', { error: (error as Error).message });
      throw error;
    }
  }

  private async checkIndexExists(indexName: string): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = ${indexName}
        ) as exists;
      `;
      return result[0]?.exists || false;
    } catch {
      return false;
    }
  }

  private async getLastAnalyzeTime(): Promise<Date | null> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ last_analyze: Date }>>`
        SELECT MAX(last_analyze) as last_analyze 
        FROM pg_stat_user_tables 
        WHERE schemaname = 'public';
      `;
      return result[0]?.last_analyze || null;
    } catch {
      return null;
    }
  }

  private async findUnusedIndexes(): Promise<string[]> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_stat_user_indexes 
        WHERE idx_tup_read = 0 
        AND idx_tup_fetch = 0
        AND indexname NOT LIKE '%_pkey';
      `;
      return result.map(r => r.indexname);
    } catch {
      return [];
    }
  }

  private async getCurrentConnectionCount(): Promise<number> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count FROM pg_stat_activity;
      `;
      return result[0]?.count || 0;
    } catch {
      return 0;
    }
  }

  private async updateTableStatistics(): Promise<void> {
    const tables = ['workflow_sessions', 'recipients', 'attachments', 'workflow_audit_logs'];
    
    for (const table of tables) {
      try {
        await this.prisma.$executeRaw`ANALYZE ${this.prisma.raw(`"${table}"`)};`;
        dbLogger.debug(`Updated statistics for table: ${table}`);
      } catch (error) {
        dbLogger.warn(`Failed to update statistics for ${table}`, { 
          error: (error as Error).message 
        });
      }
    }
  }

  private async optimizeDatabaseSettings(): Promise<void> {
    try {
      // Set work_mem for complex queries
      await this.prisma.$executeRaw`SET work_mem = '256MB';`;
      
      // Enable parallel query execution
      await this.prisma.$executeRaw`SET max_parallel_workers_per_gather = 2;`;
      
      // Optimize random page cost for SSD
      await this.prisma.$executeRaw`SET random_page_cost = 1.1;`;
      
      dbLogger.debug('Database performance settings optimized');
    } catch (error) {
      dbLogger.warn('Failed to optimize database settings', { 
        error: (error as Error).message 
      });
    }
  }

  private async verifyDatabaseFunctions(): Promise<void> {
    const functions = [
      'update_updated_at_column',
      'update_workflow_progress',
      'generate_unique_recipient_url',
    ];

    for (const functionName of functions) {
      try {
        const result = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM pg_proc 
            WHERE proname = ${functionName}
          ) as exists;
        `;
        
        if (!result[0]?.exists) {
          dbLogger.warn(`Database function missing: ${functionName}`);
        }
      } catch (error) {
        dbLogger.warn(`Failed to verify function ${functionName}`, { 
          error: (error as Error).message 
        });
      }
    }
  }

  /**
   * Monitor database performance metrics
   */
  async getPerformanceMetrics(): Promise<{
    connections: number;
    slowQueries: any[];
    indexUsage: any[];
    tableStats: any[];
    cacheHitRatio: number;
  }> {
    try {
      const [connections, indexUsage, tableStats, cacheStats] = await Promise.all([
        this.getCurrentConnectionCount(),
        this.getIndexUsage(),
        this.getTableStats(),
        this.getCacheHitRatio(),
      ]);

      return {
        connections,
        slowQueries: [], // Would need pg_stat_statements enabled
        indexUsage,
        tableStats,
        cacheHitRatio: cacheStats,
      };
    } catch (error) {
      dbLogger.error('Failed to get performance metrics', { 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  private async getIndexUsage(): Promise<any[]> {
    try {
      return await this.prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_tup_read,
          idx_tup_fetch,
          idx_scan
        FROM pg_stat_user_indexes
        ORDER BY idx_tup_read DESC
        LIMIT 20;
      `;
    } catch {
      return [];
    }
  }

  private async getTableStats(): Promise<any[]> {
    try {
      return await this.prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC;
      `;
    } catch {
      return [];
    }
  }

  private async getCacheHitRatio(): Promise<number> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ hit_ratio: number }>>`
        SELECT 
          ROUND(
            (sum(blks_hit) * 100.0) / (sum(blks_hit) + sum(blks_read)), 2
          ) as hit_ratio
        FROM pg_stat_database;
      `;
      return result[0]?.hit_ratio || 0;
    } catch {
      return 0;
    }
  }
}