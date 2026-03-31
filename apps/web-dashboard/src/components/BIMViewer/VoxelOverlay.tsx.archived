/**
 * Voxel Overlay Component for BIM Viewer
 *
 * Renders voxel grid visualization over the Speckle BIM mesh for
 * live site coordination, decision surface visualization, and
 * project status monitoring.
 *
 * Uses Three.js InstancedMesh for efficient rendering of thousands of voxels.
 *
 * @module components/BIMViewer/VoxelOverlay
 * @version 1.0.0
 */

import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as THREE from 'three';

// ==============================================================================
// Types
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

export interface VoxelOverlayProps {
  voxels: VoxelData[];
  config: VoxelOverlayConfig;
  scene: THREE.Scene;
  camera: THREE.Camera;
  visible?: boolean;
  onRequestRender?: () => void;
  onVoxelClick?: (voxelId: string) => void;
  onVoxelHover?: (voxelId: string | null) => void;
}

// ==============================================================================
// Color Mappings
// ==============================================================================

const SYSTEM_COLORS: Record<string, string> = {
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

const STATUS_COLORS: Record<string, string> = {
  PLANNED: '#3498db',
  IN_PROGRESS: '#f39c12',
  COMPLETE: '#27ae60',
  ON_HOLD: '#95a5a6',
  INSPECTION_REQUIRED: '#9b59b6',
  BLOCKED: '#e74c3c',
  ISSUE: '#c0392b',
};

const HEALTH_COLORS: Record<string, string> = {
  HEALTHY: '#27ae60',
  AT_RISK: '#f39c12',
  CRITICAL: '#e74c3c',
  BLOCKED: '#7f8c8d',
};

// ==============================================================================
// Utility Functions
// ==============================================================================

function hexToColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function getVoxelColor(voxel: VoxelData, config: VoxelOverlayConfig): THREE.Color {
  switch (config.colorScheme) {
    case VoxelColorScheme.BY_SYSTEM:
      return hexToColor(SYSTEM_COLORS[voxel.system] || SYSTEM_COLORS.UNK);

    case VoxelColorScheme.BY_STATUS:
      return hexToColor(STATUS_COLORS[voxel.status] || STATUS_COLORS.PLANNED);

    case VoxelColorScheme.BY_HEALTH:
      return hexToColor(HEALTH_COLORS[voxel.healthStatus] || HEALTH_COLORS.HEALTHY);

    case VoxelColorScheme.BY_PROGRESS: {
      const progress = (voxel.percentComplete || 0) / 100;
      // Red (0%) -> Yellow (50%) -> Green (100%)
      if (progress < 0.5) {
        return new THREE.Color(1, progress * 2, 0);
      } else {
        return new THREE.Color(1 - (progress - 0.5) * 2, 1, 0);
      }
    }

    case VoxelColorScheme.BY_DECISION_DENSITY: {
      const density = Math.min(1, voxel.decisionCount / 10);
      return new THREE.Color(density, 0, 1 - density);
    }

    case VoxelColorScheme.UNIFORM:
    default:
      return new THREE.Color('#4a90d9');
  }
}

// ==============================================================================
// Instanced Voxel Mesh
// ==============================================================================

/**
 * Create instanced mesh for efficient voxel rendering
 */
function createVoxelInstancedMesh(
  voxels: VoxelData[],
  config: VoxelOverlayConfig
): THREE.InstancedMesh | null {
  if (voxels.length === 0) return null;

  // Create box geometry (unit cube)
  const geometry = new THREE.BoxGeometry(1, 1, 1);

  // Create material based on mode
  let material: THREE.Material;

  switch (config.mode) {
    case VoxelVisualizationMode.WIREFRAME:
      material = new THREE.MeshBasicMaterial({
        wireframe: true,
        transparent: true,
        opacity: config.opacity,
      });
      break;

    case VoxelVisualizationMode.POINTS:
      // For points mode, we'd use a different approach
      material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: config.opacity,
      });
      break;

    case VoxelVisualizationMode.HEATMAP:
    case VoxelVisualizationMode.SOLID:
    default:
      material = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: config.opacity,
        roughness: 0.7,
        metalness: 0.1,
      });
      break;
  }

  // Create instanced mesh
  const mesh = new THREE.InstancedMesh(geometry, material, voxels.length);
  mesh.name = 'VoxelOverlay';
  mesh.userData.isVoxelOverlay = true;

  // Set up instance matrices and colors
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < voxels.length; i++) {
    const voxel = voxels[i];

    // Set position and scale
    dummy.position.set(voxel.center.x, voxel.center.y, voxel.center.z);
    dummy.scale.setScalar(voxel.resolution * 0.95); // Slight gap between voxels
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    // Set color
    const voxelColor = getVoxelColor(voxel, config);

    // Highlight selected voxels
    if (config.highlightedVoxels?.includes(voxel.id)) {
      voxelColor.lerp(new THREE.Color('#ffffff'), 0.5);
    }

    mesh.setColorAt(i, voxelColor);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  return mesh;
}

/**
 * Create wireframe overlay for voxel edges
 */
function createWireframeOverlay(
  voxels: VoxelData[],
  config: VoxelOverlayConfig
): THREE.LineSegments | null {
  if (voxels.length === 0 || !config.showWireframe) return null;

  const positions: number[] = [];
  const colors: number[] = [];

  const edgeColor = new THREE.Color('#333333');

  for (const voxel of voxels) {
    const halfSize = voxel.resolution / 2;
    const { x, y, z } = voxel.center;

    // Define 8 corners of the voxel
    const corners = [
      [x - halfSize, y - halfSize, z - halfSize],
      [x + halfSize, y - halfSize, z - halfSize],
      [x + halfSize, y + halfSize, z - halfSize],
      [x - halfSize, y + halfSize, z - halfSize],
      [x - halfSize, y - halfSize, z + halfSize],
      [x + halfSize, y - halfSize, z + halfSize],
      [x + halfSize, y + halfSize, z + halfSize],
      [x - halfSize, y + halfSize, z + halfSize],
    ];

    // Define 12 edges
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0], // Bottom face
      [4, 5], [5, 6], [6, 7], [7, 4], // Top face
      [0, 4], [1, 5], [2, 6], [3, 7], // Vertical edges
    ];

    for (const [start, end] of edges) {
      positions.push(...corners[start], ...corners[end]);
      colors.push(edgeColor.r, edgeColor.g, edgeColor.b);
      colors.push(edgeColor.r, edgeColor.g, edgeColor.b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'VoxelWireframe';
  lines.userData.isVoxelWireframe = true;

  return lines;
}

// ==============================================================================
// Voxel Overlay Hook
// ==============================================================================

/**
 * Custom hook for managing voxel overlay in Three.js scene
 */
export function useVoxelOverlay(
  voxels: VoxelData[],
  config: VoxelOverlayConfig,
  scene: THREE.Scene | null,
  visible: boolean = true,
  onRequestRender?: () => void
) {
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const wireframeRef = useRef<THREE.LineSegments | null>(null);
  const voxelMapRef = useRef<Map<number, string>>(new Map());

  // Filter voxels based on config
  const filteredVoxels = useMemo(() => {
    let result = voxels;

    if (config.filterSystems && config.filterSystems.length > 0) {
      result = result.filter((v) => config.filterSystems!.includes(v.system));
    }

    if (config.filterStatuses && config.filterStatuses.length > 0) {
      result = result.filter((v) => config.filterStatuses!.includes(v.status));
    }

    return result;
  }, [voxels, config.filterSystems, config.filterStatuses]);

  // Create/update mesh when voxels or config change
  useEffect(() => {
    if (!scene) return;

    // Remove existing mesh
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach((m) => m.dispose());
      } else {
        meshRef.current.material.dispose();
      }
      meshRef.current = null;
    }

    if (wireframeRef.current) {
      scene.remove(wireframeRef.current);
      wireframeRef.current.geometry.dispose();
      (wireframeRef.current.material as THREE.Material).dispose();
      wireframeRef.current = null;
    }

    // Clear voxel map
    voxelMapRef.current.clear();

    if (!visible || filteredVoxels.length === 0) return;

    // Create new mesh
    const mesh = createVoxelInstancedMesh(filteredVoxels, config);
    if (mesh) {
      meshRef.current = mesh;
      scene.add(mesh);

      // Build instance index to voxel ID map
      filteredVoxels.forEach((voxel, index) => {
        voxelMapRef.current.set(index, voxel.id);
      });
    }

    // Create wireframe overlay
    const wireframe = createWireframeOverlay(filteredVoxels, config);
    if (wireframe) {
      wireframeRef.current = wireframe;
      scene.add(wireframe);
    }

    // Trigger Speckle render pass after injecting meshes into scene
    if (onRequestRender) onRequestRender();

    // Cleanup on unmount
    return () => {
      if (meshRef.current && scene) {
        scene.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        if (Array.isArray(meshRef.current.material)) {
          meshRef.current.material.forEach((m) => m.dispose());
        } else {
          meshRef.current.material.dispose();
        }
      }
      if (wireframeRef.current && scene) {
        scene.remove(wireframeRef.current);
        wireframeRef.current.geometry.dispose();
        (wireframeRef.current.material as THREE.Material).dispose();
      }
    };
  }, [scene, filteredVoxels, config, visible, onRequestRender]);

  // Get voxel ID from instance index
  const getVoxelIdFromInstance = useCallback((instanceId: number): string | null => {
    return voxelMapRef.current.get(instanceId) || null;
  }, []);

  return {
    mesh: meshRef.current,
    wireframe: wireframeRef.current,
    voxelCount: filteredVoxels.length,
    getVoxelIdFromInstance,
  };
}

// ==============================================================================
// Main Component
// ==============================================================================

/**
 * Voxel Overlay Component
 *
 * Renders voxel visualization over BIM mesh in Speckle viewer.
 */
export const VoxelOverlay: React.FC<VoxelOverlayProps> = ({
  voxels,
  config,
  scene,
  camera,
  visible = true,
  onRequestRender,
  onVoxelClick,
  onVoxelHover,
}) => {
  const [hoveredVoxel, setHoveredVoxel] = useState<string | null>(null);

  const { mesh, getVoxelIdFromInstance } = useVoxelOverlay(
    voxels,
    config,
    scene,
    visible,
    onRequestRender
  );

  // Raycaster for voxel picking
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Handle mouse move for hover
  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!mesh || !camera) return;

      const rect = (event.target as HTMLElement).getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObject(mesh);

      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const voxelId = getVoxelIdFromInstance(intersects[0].instanceId);
        if (voxelId !== hoveredVoxel) {
          setHoveredVoxel(voxelId);
          onVoxelHover?.(voxelId);
        }
      } else if (hoveredVoxel !== null) {
        setHoveredVoxel(null);
        onVoxelHover?.(null);
      }
    },
    [mesh, camera, hoveredVoxel, getVoxelIdFromInstance, onVoxelHover]
  );

  // Handle click for selection
  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!mesh || !camera || !onVoxelClick) return;

      const rect = (event.target as HTMLElement).getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObject(mesh);

      if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
        const voxelId = getVoxelIdFromInstance(intersects[0].instanceId);
        if (voxelId) {
          onVoxelClick(voxelId);
        }
      }
    },
    [mesh, camera, getVoxelIdFromInstance, onVoxelClick]
  );

  // This component doesn't render DOM elements directly
  // It manages Three.js objects in the scene
  return null;
};

// ==============================================================================
// Voxel Legend Component
// ==============================================================================

export interface VoxelLegendProps {
  colorScheme: VoxelColorScheme;
  className?: string;
}

export const VoxelLegend: React.FC<VoxelLegendProps> = ({
  colorScheme,
  className = '',
}) => {
  const items = useMemo(() => {
    switch (colorScheme) {
      case VoxelColorScheme.BY_SYSTEM:
        return Object.entries(SYSTEM_COLORS).map(([key, color]) => ({
          label: key,
          color,
        }));

      case VoxelColorScheme.BY_STATUS:
        return Object.entries(STATUS_COLORS).map(([key, color]) => ({
          label: key.replace('_', ' '),
          color,
        }));

      case VoxelColorScheme.BY_HEALTH:
        return Object.entries(HEALTH_COLORS).map(([key, color]) => ({
          label: key.replace('_', ' '),
          color,
        }));

      case VoxelColorScheme.BY_PROGRESS:
        return [
          { label: '0%', color: '#ff0000' },
          { label: '25%', color: '#ff8000' },
          { label: '50%', color: '#ffff00' },
          { label: '75%', color: '#80ff00' },
          { label: '100%', color: '#00ff00' },
        ];

      case VoxelColorScheme.BY_DECISION_DENSITY:
        return [
          { label: 'No Decisions', color: '#0000ff' },
          { label: 'Few Decisions', color: '#8000ff' },
          { label: 'Many Decisions', color: '#ff0000' },
        ];

      default:
        return [];
    }
  }, [colorScheme]);

  return (
    <div className={`voxel-legend ${className}`}>
      <div className="legend-title">
        {colorScheme.replace('BY_', '').replace('_', ' ')}
      </div>
      <div className="legend-items">
        {items.map((item) => (
          <div key={item.label} className="legend-item">
            <div
              className="legend-color"
              style={{ backgroundColor: item.color }}
            />
            <span className="legend-label">{item.label}</span>
          </div>
        ))}
      </div>
      <style>{`
        .voxel-legend {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 8px;
          padding: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          min-width: 150px;
        }

        .legend-title {
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          color: #333;
          margin-bottom: 8px;
          border-bottom: 1px solid #eee;
          padding-bottom: 4px;
        }

        .legend-items {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .legend-color {
          width: 16px;
          height: 16px;
          border-radius: 3px;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }

        .legend-label {
          font-size: 11px;
          color: #666;
          text-transform: capitalize;
        }
      `}</style>
    </div>
  );
};

// ==============================================================================
// Voxel Controls Component
// ==============================================================================

export interface VoxelControlsProps {
  config: VoxelOverlayConfig;
  onConfigChange: (config: VoxelOverlayConfig) => void;
  availableSystems: string[];
  availableStatuses: string[];
  className?: string;
}

export const VoxelControls: React.FC<VoxelControlsProps> = ({
  config,
  onConfigChange,
  availableSystems,
  availableStatuses,
  className = '',
}) => {
  const handleModeChange = (mode: VoxelVisualizationMode) => {
    onConfigChange({ ...config, mode });
  };

  const handleColorSchemeChange = (colorScheme: VoxelColorScheme) => {
    onConfigChange({ ...config, colorScheme });
  };

  const handleOpacityChange = (opacity: number) => {
    onConfigChange({ ...config, opacity });
  };

  const handleWireframeToggle = () => {
    onConfigChange({ ...config, showWireframe: !config.showWireframe });
  };

  const handleSystemFilter = (system: string) => {
    const currentFilters = config.filterSystems || [];
    const newFilters = currentFilters.includes(system)
      ? currentFilters.filter((s) => s !== system)
      : [...currentFilters, system];
    onConfigChange({ ...config, filterSystems: newFilters.length > 0 ? newFilters : undefined });
  };

  return (
    <div className={`voxel-controls ${className}`}>
      <div className="control-section">
        <label>Visualization Mode</label>
        <div className="button-group">
          {Object.values(VoxelVisualizationMode).map((mode) => (
            <button
              key={mode}
              className={`mode-btn ${config.mode === mode ? 'active' : ''}`}
              onClick={() => handleModeChange(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="control-section">
        <label>Color By</label>
        <select
          value={config.colorScheme}
          onChange={(e) => handleColorSchemeChange(e.target.value as VoxelColorScheme)}
        >
          {Object.values(VoxelColorScheme).map((scheme) => (
            <option key={scheme} value={scheme}>
              {scheme.replace('BY_', '').replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className="control-section">
        <label>Opacity: {Math.round(config.opacity * 100)}%</label>
        <input
          type="range"
          min="0"
          max="100"
          value={config.opacity * 100}
          onChange={(e) => handleOpacityChange(Number(e.target.value) / 100)}
        />
      </div>

      <div className="control-section">
        <label>
          <input
            type="checkbox"
            checked={config.showWireframe}
            onChange={handleWireframeToggle}
          />
          Show Wireframe
        </label>
      </div>

      <div className="control-section">
        <label>Filter by System</label>
        <div className="filter-chips">
          {availableSystems.map((system) => (
            <button
              key={system}
              className={`filter-chip ${config.filterSystems?.includes(system) ? 'active' : ''}`}
              style={{
                borderColor: SYSTEM_COLORS[system] || '#ccc',
                backgroundColor: config.filterSystems?.includes(system)
                  ? SYSTEM_COLORS[system]
                  : 'transparent',
              }}
              onClick={() => handleSystemFilter(system)}
            >
              {system}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .voxel-controls {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          min-width: 280px;
        }

        .control-section {
          margin-bottom: 16px;
        }

        .control-section:last-child {
          margin-bottom: 0;
        }

        .control-section label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
        }

        .button-group {
          display: flex;
          gap: 4px;
        }

        .mode-btn {
          flex: 1;
          padding: 6px 8px;
          font-size: 10px;
          border: 1px solid #ddd;
          background: #f5f5f5;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mode-btn:hover {
          background: #e5e5e5;
        }

        .mode-btn.active {
          background: #4a90d9;
          border-color: #4a90d9;
          color: white;
        }

        .control-section select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 12px;
        }

        .control-section input[type="range"] {
          width: 100%;
        }

        .filter-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .filter-chip {
          padding: 4px 8px;
          font-size: 10px;
          border: 2px solid;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          background: transparent;
        }

        .filter-chip.active {
          color: white;
        }
      `}</style>
    </div>
  );
};

// ==============================================================================
// Exports
// ==============================================================================

export default VoxelOverlay;
