/**
 * @fileoverview SeppaContext — the project intelligence injected into
 * SEPPA's system prompt at MCP session initialisation.
 *
 * Written to projects.seppa_context JSONB at Stage 7 of the
 * Project Intake Pipeline. Read by the MCP server at session start.
 *
 * Contract guarantees:
 *   - All 7 authority levels (L0-L6) present
 *   - active_zones, blocked_zones, completed_zones are non-overlapping sets
 *   - critical_path.blockers contain valid decision_ids
 *   - pre_approval_thresholds contains at least COORDINATION type
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part VI
 */

export type AuthorityLevelKey = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

export interface AuthorityLevel {
  role: string;
  name?: string;
  budget_cad: number | null;
  email?: string;
}

export type AuthorityCascade = Record<AuthorityLevelKey, AuthorityLevel>;

export interface TaktContext {
  current_week: number;
  cycle_weeks: number;
  active_zones: string[];
  blocked_zones: string[];
  upcoming_zones: string[];
  completed_zones: string[];
}

export interface CriticalPathContext {
  summary: string;
  blockers: string[];
  next_milestone: string;
}

export interface PreApprovalThreshold {
  max_cost_cad?: number;
  max_delay_days?: number;
  same_system_only?: boolean;
  requires_inspector?: boolean;
}

export type PreApprovalThresholds = {
  COORDINATION: PreApprovalThreshold;
  [decisionType: string]: PreApprovalThreshold;
};

export interface SeppaContext {
  injected_at: string;
  bundle_version: string;
  project_name: string;
  project_type: string;
  contract_type: string;
  currency: string;
  takt: TaktContext;
  authority_cascade: AuthorityCascade;
  critical_path: CriticalPathContext;
  pre_approval_thresholds: PreApprovalThresholds;
}

export class SessionInitError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly reason: string,
  ) {
    super(`SEPPA session init failed for project '${projectId}': ${reason}`);
    this.name = 'SessionInitError';
  }
}
