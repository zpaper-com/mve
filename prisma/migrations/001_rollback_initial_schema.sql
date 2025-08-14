-- Rollback migration for initial optimized database schema
-- This migration removes all tables and objects created in 001_initial_schema_optimized.sql

-- Drop triggers first
DROP TRIGGER IF EXISTS update_workflow_progress_trigger ON "recipients";
DROP TRIGGER IF EXISTS update_workflow_sessions_updated_at ON "workflow_sessions";

-- Drop functions
DROP FUNCTION IF EXISTS generate_unique_recipient_url();
DROP FUNCTION IF EXISTS update_workflow_progress();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop indexes (will be dropped automatically with tables, but explicit for clarity)
DROP INDEX IF EXISTS "idx_audit_event_data";
DROP INDEX IF EXISTS "idx_audit_created_at";
DROP INDEX IF EXISTS "idx_audit_event_type_created";
DROP INDEX IF EXISTS "idx_audit_recipient_created";
DROP INDEX IF EXISTS "idx_audit_session_created";

DROP INDEX IF EXISTS "idx_attachment_s3_key";
DROP INDEX IF EXISTS "idx_attachment_uploaded_at";
DROP INDEX IF EXISTS "idx_attachment_file_type";
DROP INDEX IF EXISTS "idx_attachment_uploader";
DROP INDEX IF EXISTS "idx_attachment_recipient";
DROP INDEX IF EXISTS "idx_attachment_session_uploaded";

DROP INDEX IF EXISTS "idx_recipient_form_data";
DROP INDEX IF EXISTS "idx_recipient_npi";
DROP INDEX IF EXISTS "idx_recipient_mobile";
DROP INDEX IF EXISTS "idx_recipient_email";
DROP INDEX IF EXISTS "idx_recipient_expires";
DROP INDEX IF EXISTS "idx_recipient_session_order";
DROP INDEX IF EXISTS "idx_recipient_status_session";
DROP INDEX IF EXISTS "idx_recipient_unique_url";

DROP INDEX IF EXISTS "idx_workflow_metadata";
DROP INDEX IF EXISTS "idx_workflow_current_recipient";
DROP INDEX IF EXISTS "idx_workflow_last_access";
DROP INDEX IF EXISTS "idx_workflow_expires";
DROP INDEX IF EXISTS "idx_workflow_status_created";

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS "workflow_audit_logs";
DROP TABLE IF EXISTS "attachments";
DROP TABLE IF EXISTS "recipients";
DROP TABLE IF EXISTS "workflow_sessions";

-- Drop custom types/enums
DROP TYPE IF EXISTS "RecipientType";
DROP TYPE IF EXISTS "RecipientStatus";
DROP TYPE IF EXISTS "WorkflowStatus";

-- Note: Extensions are not dropped as they might be used by other applications
-- To manually drop extensions if needed:
-- DROP EXTENSION IF EXISTS "btree_gin";
-- DROP EXTENSION IF EXISTS "pg_trgm";
-- DROP EXTENSION IF EXISTS "uuid-ossp";