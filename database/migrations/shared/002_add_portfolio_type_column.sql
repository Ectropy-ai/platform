-- Add portfolio_type column to user_portfolios table
-- Phase 4 - Model Catalog API & Portfolio Foundation
-- Migration: 002_add_portfolio_type_column
-- Date: 2026-02-11

-- ============================================================================
-- ADD COLUMN
-- ============================================================================

ALTER TABLE user_portfolios
  ADD COLUMN portfolio_type VARCHAR(50);

COMMENT ON COLUMN user_portfolios.portfolio_type IS 'Portfolio type: demo (from catalog), custom (user-created), imported (from external source)';

-- ============================================================================
-- VALIDATION
-- ============================================================================

-- Verify column exists
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_portfolios' AND column_name = 'portfolio_type';

-- Expected result: portfolio_type | character varying | 50 | YES
