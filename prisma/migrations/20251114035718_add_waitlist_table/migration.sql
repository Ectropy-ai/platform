-- CreateTable
CREATE TABLE "waitlist" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "source" VARCHAR(50) DEFAULT 'landing_page',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_email_key" ON "waitlist"("email");

-- CreateIndex
CREATE INDEX "waitlist_email_idx" ON "waitlist"("email");

-- CreateIndex
CREATE INDEX "waitlist_created_at_idx" ON "waitlist"("created_at" DESC);
