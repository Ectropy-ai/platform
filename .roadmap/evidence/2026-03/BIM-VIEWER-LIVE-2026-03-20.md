# BIM Viewer Live — Session Truth Report
**Date:** 2026-03-20
**Operator:** Erik Luhtala — erik@luh.tech
**Session duration:** Full day
**Status:** CONFIRMED RENDERING IN PRODUCTION
**Mantra:** Enterprise Excellence. Schema-First. No Shortcuts.

---

## Outcome

3D BIM geometry rendering in production at ectropy.ai.
All object-stream requests returning HTTP 200.
IFC element selection working (IFCROOF selected, ownerId resolved).
662 KB geometry transferred, full building model visible.

---

## Root Cause Chain (confirmed)

| Layer | Finding | Status |
|---|---|---|
| nginx routing | /api/v2/ location block present (added 2026-03-19) | Not the cause |
| Express route | POST /api/v2/projects/:streamId/object-stream/ registered + requireAuth | Not the cause |
| Auth middleware | Returns 401 without session cookie (correct) | Not the cause |
| Speckle upstream | speckle/speckle-server:2 floating tag froze 2025-05-30 | ROOT CAUSE |

**The :2 floating tag resolved to a Speckle version predating the /api/v2/ endpoint.**
**10 months of image drift. The endpoint never existed on production.**

---

## Fix Applied

Commit: 6843d20
Change: Pinned all 5 Speckle service images from :2 to :2.29.0 across all 4 compose files
Files: docker-compose.production.yml, docker-compose.deploy.yml,
       docker-compose.staging.yml, docker-compose.development.yml
Deploy: workflow_dispatch -> deploy-production.yml -> 6/6 jobs SUCCESS
Nodes: Blue + Green

---

## Local Dev Bootstrap Fixes (this session)

All blockers encountered during first-time OrbStack stack startup:

| Blocker | Fix | Commit |
|---|---|---|
| docker-compose.yml not found | Correct filename: docker-compose.development.yml | -- |
| No env files | Copy from templates + strip export prefix from secrets.env | -- |
| COPY glob creates literal * dir | Explicit per-directory COPY lines in both Dockerfiles | d8f10b2 |
| @ectropy/database workspace not found | Add packages/*/package.json COPY lines | d8f10b2 |
| @luh-tech/crm 401 | ARG LUHTECH_PKG_READ + COPY .npmrc before pnpm install | d8f10b2 |
| @prisma/client-platform not found | 3-schema generate pattern matching production Dockerfiles | d8f10b2 |
| Google OAuth missing | BW CLI pipe-direct DEV credentials to .env.local | -- |
| LOG_FORMAT=pretty rejected | Changed to text (validator allows json or text) | -- |
| nginx host not found (ectropy-console) | Prune dead refs per DEC-002 from development.conf | b56cb3f |
| POST /api/v2/ -> 404 | Speckle 2.29.0 pin (root cause above) | 6843d20 |

---

## Production State (verified 2026-03-20)

- Speckle Server: 2.29.0 (was :2 frozen at ~May 2025 release)
- All 5 Speckle services pinned: server, frontend-2, preview, webhook, fileimport
- Both production nodes updated: blue + green
- Stream 9a5215cc88 (Demo Office Building): rendering confirmed
- Element selection: IFC metadata resolving correctly

---

## Open Items (not resolved this session)

- HARDENING-001: MinIO credential rotation (minioadmin/minioadmin)
- seed-demo-data: 0 projects on production DB
- ectropytest@gmail.com: BIM blocked by Speckle ADMIN role requirement
- Staging LB: still pointing to dead droplet 137.184.46.32
- Terraform tfvars: staging and production .tfvars files missing (only templates exist)
- mcp-server: crash-looping with same @ectropy/database build error on old image (needs rebuild in prod)
- audit_log table: does not exist in dev database (needs migration)

---

*Enterprise Excellence. Schema-First. No Shortcuts.*
*LuhTech Holdings — BIM Viewer Live — 2026-03-20*
