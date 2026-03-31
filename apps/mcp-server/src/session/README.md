# SEPPA Session Initializer

Reads `projects.seppa_context` JSONB at MCP session start and injects
project intelligence into SEPPA's system prompt.

## Contract

SEPPA must never start a session without a valid `SeppaContext`. The context
is written at Stage 7 of the Project Intake Pipeline. If the context is
missing or malformed, `SessionInitError` is thrown and the session is aborted.

## Required Context Fields

- `authority_cascade`: L0-L6 roles and budget limits
- `takt.active_zones`: zones currently in work
- `takt.blocked_zones`: zones blocked by open decisions
- `critical_path.blockers`: decision_ids blocking progress
- `pre_approval_thresholds`: what SEPPA can pre-approve without escalation

## Testing
```bash
pnpm test apps/mcp-server/src/session
```

---

Enterprise Excellence. Schema-First. No Shortcuts.
