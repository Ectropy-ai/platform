/**
 * @fileoverview Bundle type definitions for the Project Intake Pipeline.
 * A bundle is the versioned, self-describing input to the pipeline.
 * The bundle is the data. The pipeline is the code. They are always separate.
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part II
 * @see DEC-010
 */

export type BundleType = 'DEMO' | 'PILOT' | 'CI';
export type IFCDiscipline = 'ARC' | 'MEP' | 'STR';
export type SystemType =
  | 'ARCH'
  | 'STRUCT'
  | 'HVAC'
  | 'PLUMB'
  | 'ELEC'
  | 'CIVIL'
  | 'UNKNOWN';

export type IntakeStageId =
  | 'TENANT'
  | 'PROJECT'
  | 'TEAM'
  | 'IFC_INGESTION'
  | 'CONTRACT_TAKT'
  | 'DECISIONS'
  | 'SEPPA_CONTEXT';

export interface TenantSeed {
  slug: string;
  name: string;
  region: string;
  tier: string;
  pipeda_compliant: boolean;
}

export interface ProjectSeed {
  name: string;
  type: string;
  currency: string;
  contract_type?: string;
  budget?: number;
  start_date?: string;
  target_completion?: string;
}

export interface IfcFileSeed {
  discipline: IFCDiscipline;
  filename: string;
  size_bytes: number;
  sha256: string;
}

export interface IfcSeed {
  source_type: 'SPACES' | 'UPLOAD';
  base_path: string;
  files: IfcFileSeed[];
  speckle_stream_id?: string;
  speckle_already_uploaded?: boolean;
  voxelization: {
    resolution_tier: 'COARSE' | 'STANDARD' | 'FINE';
    resolution_m: number;
    strategy: string;
    expected_cell_count?: number;
  };
}

export interface PipelineFlags {
  voxelize: boolean;
  apply_takt: boolean;
  seed_decisions: boolean;
  inject_seppa_context: boolean;
  precompute_ai_analysis: boolean;
  assign_demo_user: boolean;
}

export interface BundleMetadata {
  ifc_source?: string;
  ifc_license?: string;
  narrative?: string;
  demo_story?: string;
  tags?: string[];
}

export interface IntakeBundle {
  bundle_id: string;
  bundle_version: string;
  bundle_type: BundleType;
  schema_version: string;
  created_at: string;
  created_by: string;
  tenant: TenantSeed;
  project: ProjectSeed;
  ifc: IfcSeed | null;
  staff_ref: string | null;
  contract_ref: string | null;
  takt_ref: string | null;
  decisions_ref: string | null;
  pipeline_flags: PipelineFlags;
  metadata: BundleMetadata;
}

export interface BundleManifestEntry {
  bundle_id: string;
  bundle_version: string;
  bundle_type: BundleType;
  created_at: string;
}
