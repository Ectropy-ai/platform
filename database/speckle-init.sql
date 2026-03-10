-- ====================================
-- SPECKLE DATABASE INITIALIZATION SCRIPT
-- Optimized for BIM and 3D model data
-- ====================================

-- Create extensions required for Speckle Server
CREATE EXTENSION IF NOT EXISTS uuid-ossp;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Create optimized indexes for Speckle operations
-- These will be created by Speckle migrations but we optimize them

-- Performance optimizations for BIM data
-- Set default statistics target for better query planning
ALTER DATABASE speckle SET default_statistics_target = 100;

-- Optimize for BIM workloads
ALTER DATABASE speckle SET shared_buffers = '128MB';
ALTER DATABASE speckle SET effective_cache_size = '512MB';
ALTER DATABASE speckle SET work_mem = '8MB';
ALTER DATABASE speckle SET maintenance_work_mem = '32MB';

-- Enable parallel query execution for large BIM datasets
ALTER DATABASE speckle SET max_parallel_workers_per_gather = 2;
ALTER DATABASE speckle SET max_parallel_workers = 4;

-- Optimize for frequent small transactions (typical in BIM workflows)
ALTER DATABASE speckle SET synchronous_commit = 'off';  -- For better performance in development

-- Create custom functions for BIM-specific operations
-- This will be populated by Speckle server initialization

COMMIT;
