-- Add authorized_by field to users table
-- This field tracks which admin granted authorization to a user

ALTER TABLE "users" ADD COLUMN "authorized_by" UUID;

-- Add index for querying users by who authorized them
CREATE INDEX "users_authorized_by_idx" ON "users"("authorized_by");

-- Note: Not adding foreign key constraint to allow flexibility
-- (authorized_by could reference a deleted admin account)
