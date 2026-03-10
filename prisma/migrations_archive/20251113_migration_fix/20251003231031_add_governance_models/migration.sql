-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('design_change', 'budget_allocation', 'timeline_adjustment', 'contractor_selection', 'material_change', 'governance');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('draft', 'active', 'passed', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "VoteDecision" AS ENUM ('approve', 'reject', 'abstain');

-- CreateTable
CREATE TABLE "proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "proposer_id" UUID NOT NULL,
    "proposal_type" "ProposalType" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'draft',
    "required_votes" INTEGER NOT NULL DEFAULT 1,
    "voting_deadline" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proposal_id" UUID NOT NULL,
    "voter_id" UUID NOT NULL,
    "decision" "VoteDecision" NOT NULL,
    "comment" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "voted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposals_project_id_idx" ON "proposals"("project_id");

-- CreateIndex
CREATE INDEX "proposals_status_idx" ON "proposals"("status");

-- CreateIndex
CREATE INDEX "votes_proposal_id_idx" ON "votes"("proposal_id");

-- CreateIndex
CREATE INDEX "votes_voter_id_idx" ON "votes"("voter_id");

-- CreateIndex
CREATE UNIQUE INDEX "votes_proposal_id_voter_id_key" ON "votes"("proposal_id", "voter_id");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_proposer_id_fkey" FOREIGN KEY ("proposer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
