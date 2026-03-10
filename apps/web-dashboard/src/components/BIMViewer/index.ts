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

// Voxel Overlay
export {
  VoxelOverlay,
  VoxelLegend,
  VoxelControls,
  useVoxelOverlay,
  VoxelColorScheme,
  VoxelVisualizationMode,
} from './VoxelOverlay';
export type {
  VoxelData,
  VoxelOverlayConfig,
  VoxelOverlayProps,
  VoxelLegendProps,
  VoxelControlsProps,
} from './VoxelOverlay';

// ROS MRO Coordination View
export { ROSMROView } from './ROSMROView';
export type { ROSMROViewProps } from './ROSMROView';

// Error Boundary
export { BIMViewerErrorBoundary } from './BIMViewerErrorBoundary';

// Supporting Components
export { default as IFCUploader } from './IFCUploader';
export { default as StreamSelector } from './StreamSelector';
export { default as ElementPropertiesPanel } from './ElementPropertiesPanel';
