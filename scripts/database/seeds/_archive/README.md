# Archived Seed Scripts

These files were superseded by the Project Intake Pipeline (DEC-010)
committed 2026-03-27. They wrote directly to PostgreSQL via Prisma,
bypassing the platform API entirely.

## Replacement

All seeding now flows through:
  apps/api-gateway/src/intake/intake-pipeline.ts

Entry points:
  POST /api/admin/provision-project       (PILOT bundles)
  POST /api/admin/provision-demo-user     (DEMO bundles)
  scripts/database/seeds/seed-orchestrator.ts (CI baseline — TO BE BUILT)

Bundle definitions live in:
  demo-library/maple-ridge/       (DEMO bundle)
  DO Spaces: project-bundles/     (PILOT bundles)

## Why Archived (Not Deleted)

Retained for reference during the seed-orchestrator.ts build (Phase D).
Safe to delete after seed-orchestrator.ts is implemented and validated.

Archived: 2026-03-27
Decision: DEC-010
