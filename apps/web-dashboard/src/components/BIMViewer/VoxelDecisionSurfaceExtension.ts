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

export class VoxelDecisionSurfaceExtension extends Extension {
  private _mesh: THREE.InstancedMesh | null = null;
  private _voxelData: VoxelData[] = [];

  constructor(viewer: IViewer) {
    super(viewer);
  }

  /**
   * Push new voxel data to the surface. Call when API data loads or changes.
   * Triggers a full InstancedMesh rebuild — O(n) where n = voxel count.
   */
  updateVoxels(voxels: VoxelData[]): void {
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
   * Release Three.js resources. Call on viewer container unmount.
   */
  dispose(): void {
    this._clearMesh();
  }

  onRender(): void {}

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

    if (!this._voxelData.length) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: OVERLAY_OPACITY,
      depthTest: false, // render on top of BIM geometry
      vertexColors: true,
    });

    this._mesh = new THREE.InstancedMesh(
      geometry,
      material,
      this._voxelData.length,
    );

    /**
     * THE FIX (DEC-008):
     * Use layers.enable() to ADD overlay layer while keeping default layer 0.
     * layers.set() would REPLACE all layers — camera must also have layer 4
     * enabled. enable() is additive and works with the default camera.
     */
    this._mesh.layers.enable(ObjectLayers.OVERLAY);
    this._mesh.visible = true;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    this._voxelData.forEach((voxel, i) => {
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

    // Enable OVERLAY layer on the rendering camera so it renders our mesh.
    // Speckle's camera only has DEFAULT layer enabled — objects on OVERLAY
    // are culled unless the camera also has that layer enabled.
    try {
      const cam = (this.viewer as any).getRenderer?.()?.renderingCamera;
      if (cam) cam.layers.enable(ObjectLayers.OVERLAY);
    } catch (_) {}
    try {
      const cam = (this.viewer as any).cameraHandler?.activeCam?.camera;
      if (cam) cam.layers.enable(ObjectLayers.OVERLAY);
    } catch (_) {}

    this.viewer.requestRender();
  }
}
