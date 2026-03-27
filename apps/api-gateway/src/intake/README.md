# Project Intake Pipeline

The seven-stage pipeline that provisions projects from versioned bundle descriptors.

## Architecture

See `INTAKE-ARCHITECTURE-2026-03-27.md` for the full design. Key principle:

> The bundle is the data. The pipeline is the code. They are always separate.

## Stages

| Stage | ID | Description |
|---|---|---|
| 1 | TENANT | Create org record, region, RLS namespace |
| 2 | PROJECT | Create project, Speckle stream, voxel_grid record |
| 3 | TEAM | Seed authority levels L0-L6, create staff + roles |
| 4 | IFC_INGESTION | Parse IFC -> ElementManifest -> Speckle -> BOX cells |
| 5 | CONTRACT_TAKT | Apply takt zone status distribution via coordinate UPDATEs |
| 6 | DECISIONS | Seed decisions, resolve primary_voxel_urn by proximity query |
| 7 | SEPPA_CONTEXT | Inject project intelligence into SEPPA system prompt |

## Bundle Types

- **DEMO**: All stages. Full narrative environment. Maple Ridge Commerce Centre.
- **PILOT**: Stages 1-3 + 7. Minimal scaffold. Customer uploads own IFC.
- **CI**: All stages. Pre-cached cells. Completes in <60 seconds.

## Testing
```bash
# Run all intake pipeline tests
pnpm test apps/api-gateway/src/intake

# Run a specific stage test
pnpm test apps/api-gateway/src/intake/__tests__/stage-5-contract-takt.spec.ts
```

## Decision Records

- DEC-009: BOX Architecture (BOX-ARCHITECTURE-2026-03-26.docx)
- DEC-010: Project Intake Pipeline (INTAKE-ARCHITECTURE-2026-03-27.md)

---

Enterprise Excellence. Schema-First. No Shortcuts.
