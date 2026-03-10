-- Add roles array column to users table
-- Migration: Add multi-role support for users
-- Date: 2025-11-13

-- Step 1: Add the new roles array column (nullable initially)
ALTER TABLE "users" ADD COLUMN "roles" TEXT[];

-- Step 2: Populate roles array from existing role column
-- Convert single role to array with that role
UPDATE "users" SET "roles" = ARRAY[role::text]::TEXT[];

-- Step 3: Set default for new users
ALTER TABLE "users" ALTER COLUMN "roles" SET DEFAULT ARRAY['contractor']::TEXT[];

-- Step 4: Make roles NOT NULL now that all existing rows have data
ALTER TABLE "users" ALTER COLUMN "roles" SET NOT NULL;

-- Note: We keep the legacy 'role' column for backward compatibility
-- Future migrations can remove it once all code is updated
