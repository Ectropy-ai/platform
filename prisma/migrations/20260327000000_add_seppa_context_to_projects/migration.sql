-- Add seppa_context JSONB column to projects table.
-- Stage 7 of the Project Intake Pipeline writes SEPPA's
-- project intelligence here at intake time.
-- Read by MCP server at session init.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "seppa_context" JSONB;
