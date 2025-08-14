-- Initialize PostgreSQL database for MVE project
-- This script runs when the database is first created

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create database user if not exists (already created via environment variables)
-- The main database and user are created via POSTGRES_DB and POSTGRES_USER env vars

-- Set timezone
SET timezone = 'UTC';

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS public;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA public TO mve_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mve_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mve_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO mve_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO mve_user;

-- Log successful initialization
DO $$
BEGIN
  RAISE NOTICE 'MVE database initialized successfully at %', now();
END $$;