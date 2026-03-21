# HARDENING-001 — MinIO Credential Rotation

**Status:** COMPLETE
**Priority:** P1 — complete before external demo or pilot handoff
**Created:** 2026-03-17
**Context:** MinIO bootstrapped with factory defaults (minioadmin/minioadmin).
Stabilized for production validation. Must rotate before any external
access beyond current trial.

## Steps
1. Generate strong credentials: `openssl rand -hex 32`
2. Store new values in Bitwarden as ECTROPY_PROD_MINIO_ACCESS_KEY /
   ECTROPY_PROD_MINIO_SECRET_KEY
3. Update GitHub Secrets (repo-level AND environment-level)
4. Update MinIO container env via .env on both nodes
5. Update speckle-server container env via .env on both nodes
6. Restart both containers on both nodes
7. Validate speckle-server healthy + BIM viewer token valid
8. Commit truth report TRUTH-MINIO-ROTATION-{date}.json

## Gate criteria
- speckle-server: Up (not Restarting)
- tokenStatus: 'valid' in BIM viewer for all roles
- n8n canary: 200 before and after
- Bitwarden vault updated
- GitHub Secrets updated (both levels)


---

## Completion Record — 2026-03-20

- Credentials: Stored in Bitwarden
  - ECTROPY_PROD_MINIO_ACCESS_KEY (item: 1274ffca)
  - ECTROPY_PROD_MINIO_SECRET_KEY (item: 8d9745ed)
- DO Spaces .env.production updated (backup: .env.production.20260320-145407)
- config-sync.timer propagated new credentials to both production nodes
- Speckle 2.29.0 healthy post-rotation
- n8n canary: 200 pre-rotation, mid-rotation, post-deploy
- MinIO no longer using factory defaults
- Production blue node deployed and verified (143.198.48.156)
- All services: 200 (ectropy.ai, API health, Speckle GraphQL, SEPPA/MCP)
