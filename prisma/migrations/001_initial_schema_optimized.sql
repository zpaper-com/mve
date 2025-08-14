-- Initial optimized database schema for MVE project
-- This migration creates all tables with performance-optimized indexes

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search and similarity
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite indexes on JSONB

-- Create enums for type safety and performance
CREATE TYPE "WorkflowStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'ACCESSED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'EXPIRED');
CREATE TYPE "RecipientType" AS ENUM ('PRESCRIBER', 'PATIENT', 'PHARMACY', 'INSURANCE', 'CUSTOM');

-- Create workflow_sessions table with optimized structure
CREATE TABLE "workflow_sessions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "document_url" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "status" "WorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP,
    "metadata" JSONB,
    "current_recipient_order" INTEGER,
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "completed_recipients" INTEGER NOT NULL DEFAULT 0,
    "created_by" VARCHAR(255),
    "last_access" TIMESTAMP
);

-- Create recipients table with comprehensive tracking
CREATE TABLE "recipients" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "session_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "recipient_type" "RecipientType" NOT NULL,
    "party_name" VARCHAR(255),
    "email" VARCHAR(320), -- RFC 5321 compliant
    "mobile" VARCHAR(20),
    "npi" VARCHAR(10),
    "unique_url" VARCHAR(100) UNIQUE NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "accessed_at" TIMESTAMP,
    "completed_at" TIMESTAMP,
    "expires_at" TIMESTAMP,
    "form_data" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "email_sent_at" TIMESTAMP,
    "sms_sent_at" TIMESTAMP,
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    
    -- Foreign key constraints
    CONSTRAINT "fk_recipient_session" FOREIGN KEY ("session_id") REFERENCES "workflow_sessions"("id") ON DELETE CASCADE,
    CONSTRAINT "uniq_session_order" UNIQUE ("session_id", "order_index")
);

-- Create attachments table with enhanced tracking
CREATE TABLE "attachments" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "session_id" UUID NOT NULL,
    "recipient_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "s3_key" VARCHAR(500) UNIQUE NOT NULL,
    "s3_bucket" VARCHAR(100) NOT NULL,
    "uploaded_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "uploaded_by" UUID,
    "checksum" VARCHAR(64), -- SHA-256 hash
    "scan_status" VARCHAR(50),
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "last_download" TIMESTAMP,
    
    -- Foreign key constraints
    CONSTRAINT "fk_attachment_session" FOREIGN KEY ("session_id") REFERENCES "workflow_sessions"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_attachment_recipient" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE SET NULL,
    CONSTRAINT "fk_attachment_uploader" FOREIGN KEY ("uploaded_by") REFERENCES "recipients"("id") ON DELETE SET NULL
);

-- Create audit log table for comprehensive tracking
CREATE TABLE "workflow_audit_logs" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "session_id" UUID NOT NULL,
    "recipient_id" UUID,
    "event_type" VARCHAR(50) NOT NULL,
    "event_data" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create high-performance indexes for workflow_sessions
CREATE INDEX "idx_workflow_status_created" ON "workflow_sessions" ("status", "created_at");
CREATE INDEX "idx_workflow_expires" ON "workflow_sessions" ("expires_at") WHERE "expires_at" IS NOT NULL;
CREATE INDEX "idx_workflow_last_access" ON "workflow_sessions" ("last_access") WHERE "last_access" IS NOT NULL;
CREATE INDEX "idx_workflow_current_recipient" ON "workflow_sessions" ("current_recipient_order");
CREATE INDEX "idx_workflow_metadata" ON "workflow_sessions" USING GIN ("metadata") WHERE "metadata" IS NOT NULL;

-- Create optimized indexes for recipients (most critical table for performance)
CREATE UNIQUE INDEX "idx_recipient_unique_url" ON "recipients" ("unique_url"); -- Most important for URL lookups
CREATE INDEX "idx_recipient_status_session" ON "recipients" ("status", "session_id");
CREATE INDEX "idx_recipient_session_order" ON "recipients" ("session_id", "order_index");
CREATE INDEX "idx_recipient_expires" ON "recipients" ("expires_at") WHERE "expires_at" IS NOT NULL;
CREATE INDEX "idx_recipient_email" ON "recipients" ("email") WHERE "email" IS NOT NULL;
CREATE INDEX "idx_recipient_mobile" ON "recipients" ("mobile") WHERE "mobile" IS NOT NULL;
CREATE INDEX "idx_recipient_npi" ON "recipients" ("npi") WHERE "npi" IS NOT NULL;
CREATE INDEX "idx_recipient_form_data" ON "recipients" USING GIN ("form_data") WHERE "form_data" IS NOT NULL;

-- Create indexes for attachments
CREATE INDEX "idx_attachment_session_uploaded" ON "attachments" ("session_id", "uploaded_at");
CREATE INDEX "idx_attachment_recipient" ON "attachments" ("recipient_id") WHERE "recipient_id" IS NOT NULL;
CREATE INDEX "idx_attachment_uploader" ON "attachments" ("uploaded_by") WHERE "uploaded_by" IS NOT NULL;
CREATE INDEX "idx_attachment_file_type" ON "attachments" ("file_type");
CREATE INDEX "idx_attachment_uploaded_at" ON "attachments" ("uploaded_at");
CREATE INDEX "idx_attachment_s3_key" ON "attachments" ("s3_key");

-- Create indexes for audit logs
CREATE INDEX "idx_audit_session_created" ON "workflow_audit_logs" ("session_id", "created_at");
CREATE INDEX "idx_audit_recipient_created" ON "workflow_audit_logs" ("recipient_id", "created_at") WHERE "recipient_id" IS NOT NULL;
CREATE INDEX "idx_audit_event_type_created" ON "workflow_audit_logs" ("event_type", "created_at");
CREATE INDEX "idx_audit_created_at" ON "workflow_audit_logs" ("created_at");
CREATE INDEX "idx_audit_event_data" ON "workflow_audit_logs" USING GIN ("event_data") WHERE "event_data" IS NOT NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for workflow_sessions updated_at
CREATE TRIGGER update_workflow_sessions_updated_at 
    BEFORE UPDATE ON "workflow_sessions" 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically update workflow progress
CREATE OR REPLACE FUNCTION update_workflow_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Update workflow session progress when recipient status changes
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        IF NEW.status = 'COMPLETED' THEN
            UPDATE "workflow_sessions" 
            SET 
                "completed_recipients" = (
                    SELECT COUNT(*) FROM "recipients" 
                    WHERE "session_id" = NEW.session_id AND "status" = 'COMPLETED'
                ),
                "current_recipient_order" = (
                    SELECT MIN("order_index") FROM "recipients" 
                    WHERE "session_id" = NEW.session_id AND "status" IN ('PENDING', 'ACCESSED', 'IN_PROGRESS')
                ),
                "last_access" = NOW()
            WHERE "id" = NEW.session_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for automatic workflow progress updates
CREATE TRIGGER update_workflow_progress_trigger
    AFTER UPDATE ON "recipients"
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_progress();

-- Create function for recipient URL generation (used by application)
CREATE OR REPLACE FUNCTION generate_unique_recipient_url()
RETURNS VARCHAR(100) AS $$
DECLARE
    url_candidate VARCHAR(100);
    url_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate a base32-like string (simplified for SQL)
        url_candidate := lower(encode(gen_random_bytes(15), 'base64'));
        url_candidate := translate(url_candidate, '+/=', 'xyz');
        url_candidate := substr(url_candidate, 1, 24);
        
        -- Check if URL already exists
        SELECT EXISTS(SELECT 1 FROM "recipients" WHERE "unique_url" = url_candidate) INTO url_exists;
        
        EXIT WHEN NOT url_exists;
    END LOOP;
    
    RETURN url_candidate;
END;
$$ language 'plpgsql';

-- Add constraints for data integrity
ALTER TABLE "workflow_sessions" ADD CONSTRAINT "chk_total_recipients_positive" CHECK ("total_recipients" >= 0);
ALTER TABLE "workflow_sessions" ADD CONSTRAINT "chk_completed_recipients_valid" CHECK ("completed_recipients" >= 0 AND "completed_recipients" <= "total_recipients");
ALTER TABLE "recipients" ADD CONSTRAINT "chk_order_index_positive" CHECK ("order_index" >= 0);
ALTER TABLE "recipients" ADD CONSTRAINT "chk_retry_count_positive" CHECK ("retry_count" >= 0);
ALTER TABLE "recipients" ADD CONSTRAINT "chk_reminder_count_positive" CHECK ("reminder_count" >= 0);
ALTER TABLE "attachments" ADD CONSTRAINT "chk_file_size_positive" CHECK ("file_size" > 0);
ALTER TABLE "attachments" ADD CONSTRAINT "chk_download_count_positive" CHECK ("download_count" >= 0);

-- Create database statistics for query planner optimization
ANALYZE "workflow_sessions";
ANALYZE "recipients";
ANALYZE "attachments";
ANALYZE "workflow_audit_logs";

-- Add comments for documentation
COMMENT ON TABLE "workflow_sessions" IS 'Main workflow tracking table with performance optimizations';
COMMENT ON TABLE "recipients" IS 'Sequential workflow participants with comprehensive status tracking';
COMMENT ON TABLE "attachments" IS 'File attachments with S3 metadata and access tracking';
COMMENT ON TABLE "workflow_audit_logs" IS 'Comprehensive audit trail for all workflow events';
COMMENT ON INDEX "idx_recipient_unique_url" IS 'Critical index for fast recipient URL lookups - most important for performance';
COMMENT ON FUNCTION update_workflow_progress() IS 'Automatically maintains workflow progress counters and current recipient tracking';