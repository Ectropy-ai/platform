/**
 * BIM Viewer Components Index
 *
 * Exports all BIM visualization components including:
 * - SpeckleBIMViewer: 3D BIM mesh rendering via Speckle
 * - VoxelOverlay: Voxel grid visualization
 * - ROSMROView: Combined coordination view
 * - Supporting components and utilities
 *
 * @module components/BIMViewer
 * @version 1.0.0
 */

// Core BIM Viewer
export { default as SpeckleBIMViewer } from './SpeckleBIMViewer';
export type { default as SpeckleBIMViewerProps } from './SpeckleBIMViewer';

// Voxel Types (canonical source of truth — DEC-008)
export {
  VoxelColorScheme,
  VoxelVisualizationMode,
  SYSTEM_COLORS,
  STATUS_COLORS,
  HEALTH_COLORS,
} from './VoxelTypes';
export type {
  VoxelData,
  VoxelOverlayConfig,
  VoxelLegendProps,
  VoxelControlsProps,
} from './VoxelTypes';

// Voxel Legend (extracted from VoxelOverlay — DEC-008)
export { VoxelLegend } from './VoxelLegend';

// Voxel Decision Surface Extension (replaces VoxelOverlay — DEC-008)
export { VoxelDecisionSurfaceExtension } from './VoxelDecisionSurfaceExtension';

// ROS MRO Coordination View
export { ROSMROView } from './ROSMROView';
export type { ROSMROViewProps } from './ROSMROView';

// Error Boundary
export { BIMViewerErrorBoundary } from './BIMViewerErrorBoundary';

// Supporting Components
export { default as IFCUploader } from './IFCUploader';
export { default as StreamSelector } from './StreamSelector';
export { default as ElementPropertiesPanel } from './ElementPropertiesPanel';
