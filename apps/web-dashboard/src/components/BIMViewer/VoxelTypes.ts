/**
 * Canonical voxel type definitions for the BIM Viewer module.
 *
 * Single source of truth for VoxelData, color schemes, visualization modes,
 * and color palettes used by VoxelDecisionSurfaceExtension, VoxelLegend,
 * and ROSMROView.
 *
 * Extracted from VoxelOverlay.tsx as part of DEC-008.
 *
 * @module BIMViewer/VoxelTypes
 */

// ==============================================================================
// Enums
// ==============================================================================

export enum VoxelColorScheme {
  BY_SYSTEM = 'BY_SYSTEM',
  BY_STATUS = 'BY_STATUS',
  BY_HEALTH = 'BY_HEALTH',
  BY_PROGRESS = 'BY_PROGRESS',
  BY_DECISION_DENSITY = 'BY_DECISION_DENSITY',
  UNIFORM = 'UNIFORM',
}

export enum VoxelVisualizationMode {
  SOLID = 'SOLID',
  WIREFRAME = 'WIREFRAME',
  POINTS = 'POINTS',
  HEATMAP = 'HEATMAP',
}

// ==============================================================================
// Interfaces
// ==============================================================================

export interface VoxelData {
  id: string;
  voxelId: string;
  center: { x: number; y: number; z: number };
  resolution: number;
  system: string;
  status: string;
  healthStatus: string;
  decisionCount: number;
  percentComplete?: number;
}

export interface VoxelOverlayConfig {
  mode: VoxelVisualizationMode;
  colorScheme: VoxelColorScheme;
  opacity: number;
  showWireframe: boolean;
  showLabels: boolean;
  filterSystems?: string[];
  filterStatuses?: string[];
  highlightedVoxels?: string[];
}

export interface VoxelLegendProps {
  colorScheme: VoxelColorScheme;
  className?: string;
}

export interface VoxelControlsProps {
  config: VoxelOverlayConfig;
  onConfigChange: (config: VoxelOverlayConfig) => void;
  availableSystems: string[];
  availableStatuses: string[];
  className?: string;
}

// ==============================================================================
// Color Palettes
// ==============================================================================

export const SYSTEM_COLORS: Record<string, string> = {
  STRUCT: '#808080',
  MECH: '#0066cc',
  ELEC: '#ffcc00',
  PLUMB: '#00cc66',
  HVAC: '#00cccc',
  FIRE: '#ff0000',
  ARCH: '#996633',
  CIVIL: '#663300',
  TELE: '#9900cc',
  LAND: '#00ff00',
  UNK: '#cccccc',
};

export const STATUS_COLORS: Record<string, string> = {
  PLANNED: '#3498db',
  IN_PROGRESS: '#f39c12',
  COMPLETE: '#27ae60',
  ON_HOLD: '#95a5a6',
  INSPECTION_REQUIRED: '#9b59b6',
  BLOCKED: '#e74c3c',
  ISSUE: '#c0392b',
};

export const HEALTH_COLORS: Record<string, string> = {
  HEALTHY: '#27ae60',
  AT_RISK: '#f39c12',
  CRITICAL: '#e74c3c',
  BLOCKED: '#7f8c8d',
};
