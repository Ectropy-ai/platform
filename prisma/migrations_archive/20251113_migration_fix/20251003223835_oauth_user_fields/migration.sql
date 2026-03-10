-- Add OAuth fields to users table
ALTER TABLE "users" 
  ALTER COLUMN "password_hash" DROP NOT NULL,
  ADD COLUMN "picture" VARCHAR(500),
  ADD COLUMN "provider" VARCHAR(50),
  ADD COLUMN "provider_id" VARCHAR(255),
  ADD COLUMN "last_login" TIMESTAMPTZ(6);

-- Add unique constraint for OAuth provider authentication
CREATE UNIQUE INDEX "users_provider_provider_id_key" ON "users"("provider", "provider_id");

-- Add index on email for faster lookups
CREATE INDEX "users_email_idx" ON "users"("email");
