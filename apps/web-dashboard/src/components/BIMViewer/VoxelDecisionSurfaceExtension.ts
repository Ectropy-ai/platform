/**
 * VoxelDecisionSurfaceExtension
 *
 * Speckle IExtension that renders the Voxel Decision Surface as a colored
 * InstancedMesh overlay on the BIM model. Replaces VoxelOverlay.tsx (DEC-008).
 *
 * Architecture:
 *   - Extends Speckle's Extension base class for proper lifecycle management
 *   - Uses ObjectLayers.OVERLAY (4) so Speckle's renderer includes the mesh
 *     in its OVERLAY render pass — the root cause fix for invisible voxels
 *   - MeshBasicMaterial: no lighting dependency, correct for status-encoded color
 *   - depthTest: false: cubes render on top of BIM geometry (not buried inside)
 *   - InstancedMesh: single draw call for all voxels, scales to 200+
 *
 * Integration:
 *   - Registered: viewer.createExtension(VoxelDecisionSurfaceExtension)
 *   - Data:       ext.updateVoxels(voxels) when API data loads/changes
 *   - Toggle:     ext.setVisible(bool) from UI Voxels switch
 *   - Cleanup:    ext.dispose() on viewer unmount
 *
 * @see DEC-008 in .roadmap/decision-log.json
 * @module BIMViewer
 */

import { Extension, type IViewer, ObjectLayers } from '@speckle/viewer';
import * as THREE from 'three';
import type { VoxelData } from './VoxelTypes';

/** Status color palette — matches design system tokens */
const STATUS_COLORS_HEX: Record<string, number> = {
  BLOCKED: 0xef4444, // red-500
  AT_RISK: 0xf97316, // orange-500
  IN_PROGRESS: 0x22c55e, // green-500
  COMPLETE: 0x6b7280, // gray-500
  PLANNED: 0x3b82f6, // blue-500
  ON_HOLD: 0xa855f7, // purple-500
};

const DEFAULT_COLOR = 0x888888;
const OVERLAY_OPACITY = 0.7;

/** Element sent to POST /projects/:id/voxels/generate. DEC-009 BOX. */
interface VoxelIFCElement {
  globalId: string;
  type: string;
  containedInStorey: string;
  materials: never[];
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

export class VoxelDecisionSurfaceExtension extends Extension {
  private _mesh: THREE.InstancedMesh | null = null;
  private _voxelData: VoxelData[] = [];
  private _filteredData: VoxelData[] | null = null;

  constructor(viewer: IViewer) {
    super(viewer);
  }

  /**
   * Push new voxel data to the surface. Call when API data loads or changes.
   * Triggers a full InstancedMesh rebuild — O(n) where n = voxel count.
   */
  updateVoxels(voxels: VoxelData[]): void {
    console.log('[DEC-008 ext] updateVoxels called, count:', voxels.length);
    this._voxelData = voxels;
    this._rebuildMesh();
  }

  /**
   * Toggle surface visibility. Maps to the Voxels switch in the UI header.
   */
  setVisible(visible: boolean): void {
    this.enabled = visible;
    if (this._mesh) this._mesh.visible = visible;
    this.viewer.requestRender();
  }

  /**
   * Filter visible voxels by system, status, and/or level.
   * Empty array = no filter on that dimension (show all).
   * Rebuilds the InstancedMesh with only matching voxels.
   * NOTE: level filtering pending VoxelData.level field addition (GAP-FILTER-001).
   */
  applyFilters(filters: {
    systems?: string[];
    statuses?: string[];
    levels?: string[]; // placeholder — level not yet in VoxelData
  }): void {
    const { systems, statuses } = filters; // levels intentionally unused — GAP-FILTER-001
    const noSystemFilter = !systems || systems.length === 0;
    const noStatusFilter = !statuses || statuses.length === 0;

    if (noSystemFilter && noStatusFilter) {
      this._filteredData = null;
    } else {
      this._filteredData = this._voxelData.filter(v => {
        const systemMatch = noSystemFilter || systems!.includes(v.system);
        const statusMatch = noStatusFilter || statuses!.includes(v.status);
        return systemMatch && statusMatch;
      });
    }
    this._rebuildMesh();
  }

  /**
   * Release Three.js resources. Call on viewer container unmount.
   */
  dispose(): void {
    this._clearMesh();
  }

  onRender(): void {}

  // ─── DEC-009 BOX Pipeline ────────────────────────────────────────────────

  /**
   * Extract element bounding boxes from the renderer batch objects.
   * Uses renderer.getObjects() → BatchObject[].aabb (world-space, meters).
   *
   * API note: getWorldTree() is minified away in @speckle/viewer 2.28.0.
   * renderer.getObjects() is the confirmed working path.
   * DEC-009 BOX Pipeline Phase 1.
   */
  private extractElementsFromWorldTree(): VoxelIFCElement[] {
    const renderer = (this.viewer as any).getRenderer?.();
    if (!renderer) {
      console.warn('[BOX] No renderer available');
      return [];
    }

    // Build speckle_type lookup from WorldTree (node.model.raw.speckle_type
    // contains real IFC type strings like "Objects.BuiltElements.Wall:...")
    const typeMap = new Map<string, string>();
    try {
      const tree = (this.viewer as any).getWorldTree?.();
      if (tree?.root) {
        const stack = [tree.root];
        while (stack.length) {
          const node = stack.pop();
          if (node?.model?.raw?.speckle_type && node.model.id) {
            typeMap.set(node.model.id, node.model.raw.speckle_type);
          }
          const children = node?.model?.children ?? node?.children ?? [];
          for (const child of children) stack.push(child);
        }
      }
      console.log(`[BOX] WorldTree type lookup: ${typeMap.size} entries`);
    } catch (e) {
      console.warn('[BOX] WorldTree walk failed, types will be Unknown', e);
    }

    const batchObjects: any[] = renderer.getObjects?.() ?? [];
    console.log(`[BOX] Batch objects from renderer: ${batchObjects.length}`);

    const elements: VoxelIFCElement[] = [];
    let nullCount = 0;

    for (const bObj of batchObjects) {
      const b = bObj?.aabb;
      if (!b) { nullCount++; continue; }

      // Guard: reject infinite or zero-volume boxes
      if (
        !isFinite(b.min?.x) || !isFinite(b.max?.x) ||
        (b.min.x === b.max.x && b.min.y === b.max.y && b.min.z === b.max.z)
      ) { nullCount++; continue; }

      // Extract identity from renderView.renderData (confirmed in Speckle source)
      const rd = bObj?.renderView?.renderData ?? {};
      const objId = rd?.id ?? `gen-${elements.length}`;

      // Resolve real IFC type from WorldTree lookup
      const rawType = typeMap.get(objId) ?? 'Objects.BuiltElements.Unknown';

      // Z-banding for level (meters, world-space). Ranges from staging coord_z:
      // -2.15 → 14.57m. Bands calibrated to Maple Ridge IFC storey heights.
      const centerZ = (b.min.z + b.max.z) / 2;
      let level: string;
      if (centerZ < 1.0) level = 'Level 0';
      else if (centerZ < 4.5) level = 'First Floor';
      else if (centerZ < 8.5) level = 'Second Floor';
      else level = 'Roof - Main';

      elements.push({
        globalId: objId,
        type: rawType,
        containedInStorey: level,
        materials: [],
        boundingBox: {
          min: { x: b.min.x, y: b.min.y, z: b.min.z },
          max: { x: b.max.x, y: b.max.y, z: b.max.z },
        },
      });
    }

    console.log(`[BOX] Extracted ${elements.length} elements, skipped ${nullCount}`);
    return elements;
  }

  /**
   * Send WorldTree elements to the server-side generate route.
   * Server runs VoxelDecompositionService, writes voxel_grids + pm_voxels.
   * BOX = BIM + BOM + VOX. DEC-009 BOX Pipeline Phase 1.
   */
  /**
   * @param projectId - Ectropy project UUID
   * @param streamId  - Speckle stream ID from project's speckle_streams row
   * @param objectId  - Root Speckle object ID (ARC) from speckle_streams.latest_object_id
   *
   * Never pass hardcoded stream or object IDs — always resolve from the
   * project context via GET /api/speckle/projects/:id/streams.
   */
  async generateAndPersistBoxes(
    projectId: string,
    streamId: string,
    objectId: string,
  ): Promise<void> {
    if (!projectId?.match(/^[0-9a-f-]{36}$/)) {
      console.warn('[BOX] Invalid projectId:', projectId);
      return;
    }

    // Idempotency: BOX cells are permanent records in pm_voxels.
    // Only generate if none exist for this project yet.
    try {
      const check = await fetch(`/api/v1/projects/${projectId}/voxels?limit=1`);
      if (check.ok) {
        const data = await check.json();
        const total = data.total ?? data.voxels?.length ?? 0;
        if (total > 0) {
          console.log(`[BOX] ${total} cells exist — skipping generation`);
          return;
        }
      }
    } catch {
      // If check fails, proceed with generation attempt
    }

    console.log(`[BOX] No BOX cells found — generating from WorldTree...`);
    const elements = this.extractElementsFromWorldTree();
    if (!elements.length) {
      console.warn('[BOX] No elements extracted — aborting');
      return;
    }

    // Convert bboxes from meters (aabb) to millimeters (engine expects mm)
    const M_TO_MM = 1000;
    const mmElements = elements.map((e) => ({
      ...e,
      boundingBox: {
        min: { x: e.boundingBox.min.x * M_TO_MM, y: e.boundingBox.min.y * M_TO_MM, z: e.boundingBox.min.z * M_TO_MM },
        max: { x: e.boundingBox.max.x * M_TO_MM, y: e.boundingBox.max.y * M_TO_MM, z: e.boundingBox.max.z * M_TO_MM },
      },
    }));

    console.log(`[BOX] Sending ${mmElements.length} elements to generate route (mm)...`);
    const resp = await fetch(
      `/api/v1/projects/${projectId}/voxels/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          elements: mmElements,
          resolution: 100, // COARSE = 100mm
          streamId,
          objectId,
        }),
      },
    );

    if (!resp.ok) {
      console.error(`[BOX] Generate route failed: ${resp.status}`, await resp.text());
      return;
    }

    const { gridId, voxelCount } = await resp.json();
    console.log(`[BOX] Complete — gridId: ${gridId}, voxelCount: ${voxelCount}`);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _clearMesh(): void {
    if (!this._mesh) return;
    this.viewer.getRenderer().scene.remove(this._mesh);
    this._mesh.geometry.dispose();
    (this._mesh.material as THREE.Material).dispose();
    this._mesh = null;
  }

  private _rebuildMesh(): void {
    this._clearMesh();
    const data = this._filteredData ?? this._voxelData;
    console.log('[DEC-008 ext] _rebuildMesh, renderer:', !!(this.viewer as any).getRenderer?.(), 'scene:', !!(this.viewer as any).getRenderer?.()?.scene, 'voxelData:', data.length);

    if (!data.length) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: OVERLAY_OPACITY,
      depthTest: false, // render on top of BIM geometry
    });
    (material as any).onBuild = () => {};

    this._mesh = new THREE.InstancedMesh(
      geometry,
      material,
      data.length,
    );

    // OVERLAY layer (4) — rendered by overlayPass in Speckle's DefaultPipeline.
    // Layer 0 is ObjectLayers.NONE — no pipeline pass processes it.
    // OVERLAY is the correct layer for custom content rendered on top of BIM.
    this._mesh.layers.set(ObjectLayers.OVERLAY);
    this._mesh.visible = true;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    data.forEach((voxel, i) => {
      position.set(voxel.center.x, voxel.center.y, voxel.center.z);
      scale.setScalar(voxel.resolution);
      matrix.compose(position, rotation, scale);
      this._mesh!.setMatrixAt(i, matrix);
      color.set(STATUS_COLORS_HEX[voxel.status] ?? DEFAULT_COLOR);
      this._mesh!.setColorAt(i, color);
    });

    this._mesh.instanceMatrix.needsUpdate = true;
    if (this._mesh.instanceColor) this._mesh.instanceColor.needsUpdate = true;

    this.viewer.getRenderer().scene.add(this._mesh);
    this.viewer.requestRender();
  }
}
