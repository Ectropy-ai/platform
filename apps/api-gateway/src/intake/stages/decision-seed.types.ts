/**
 * @fileoverview DecisionSeed type definitions — the shape of entries
 * in bundle decisions.json files.
 *
 * The pre-seeded ai_analysis is the correct analysis computed from
 * real IFC geometry + contract data, stored at seed time.
 * SEPPA surfaces it directly in <1 second without re-deriving it.
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part V
 */

export interface ClashLocation {
  centroid_x: number;
  centroid_y: number;
  centroid_z: number;
  x_min: number; x_max: number;
  y_min: number; y_max: number;
  z_min: number; z_max: number;
}

export interface DecisionExposure {
  cost_cad: number;
  delay_days: number;
  critical_path: boolean;
  risk_if_unresolved_today?: string;
}

export interface DecisionAuthority {
  level_required: number;
  role: string;
  name?: string;
  contact?: string;
}

export interface DecisionPreApproval {
  available: boolean;
  condition?: string;
  contract_clause?: string;
}

export interface AIAnalysis {
  computed_at: string;
  model?: string;
  version?: string;
  situation: string;
  exposure: DecisionExposure;
  authority: DecisionAuthority;
  pre_approval?: DecisionPreApproval;
  recommended_action: string;
}

export interface DecisionDef {
  decision_ref: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  authority_required: number;
  question: string;
  clash_location: ClashLocation;
  budget_estimated?: number;
  delay_days?: number;
  critical_path?: boolean;
  look_ahead_week?: number;
  ai_analysis: AIAnalysis;
}

export interface DecisionSeedFile {
  decisions: DecisionDef[];
}
