/**
 * VoxelRasterizerService — pure spatial rasterization engine for the BOX pipeline.
 *
 * Converts IFC element bounding boxes into a discrete grid of BOX cells
 * at a specified resolution using conservative AABB voxelization.
 *
 * No database dependencies. Inputs and outputs are plain TypeScript objects.
 * All coordinates are in MILLIMETRES throughout this module.
 * Caller applies MM_TO_M (0.001) before writing to database.
 *
 * Extracted from apps/api-gateway/src/routes/voxels.routes.ts (DEC-009).
 *
 * @module voxel-rasterizer.service
 * @see DEC-009 — BOX Pipeline Architecture
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Axis-aligned bounding box with min/max corners. Coordinates in mm. */
export interface BoxBBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/**
 * A single IFC element prepared for rasterization.
 * Coordinates in millimetres (Speckle metres × 1000).
 */
export interface BoxElement {
  globalId: string;
  type: string;
  containedInStorey: string;
  boundingBox: BoxBBox;
}

/**
 * A single discrete BOX cell produced by the rasterizer.
 * Coordinates in millimetres. Caller converts to metres before DB write.
 */
export interface BoxCell {
  center: { x: number; y: number; z: number };
  bounds: BoxBBox;
  system: string;
  level: string;
  ifcElements: string[];
}

// ─── System classification ────────────────────────────────────────────────────

/**
 * Maps an IFC entity type string to an Ectropy system classification.
 *
 * @param entityType - IFC entity type (e.g. "IfcWall", "IfcDuctSegment")
 * @returns System string: PLUMB, ELEC, HVAC, FIRE, STRUCT, ARCH, or UNK
 */
export function classifySystem(entityType: string): string {
  const t = entityType.toLowerCase();
  if (t.includes('pipe') || t.includes('plumb') || t.includes('sanitary')) return 'PLUMB';
  if (t.includes('elec') || t.includes('light') || t.includes('cable')) return 'ELEC';
  if (t.includes('hvac') || t.includes('duct') || t.includes('air') || t.includes('ventil')) return 'HVAC';
  if (t.includes('sprinkler') || t.includes('fire') || t.includes('alarm')) return 'FIRE';
  if (t.includes('column') || t.includes('beam') || t.includes('slab') || t.includes('foundation')) return 'STRUCT';
  if (t.includes('wall') || t.includes('door') || t.includes('window') || t.includes('stair')) return 'ARCH';
  return 'UNK';
}

// ─── Rasterizer ───────────────────────────────────────────────────────────────

/** Maximum BOX cells per rasterization run. Auto-coarsens if exceeded. */
const MAX_CELLS = 500_000;

/**
 * Rasterizes an array of IFC elements into a discrete BOX cell grid.
 *
 * Algorithm: conservative AABB voxelization. For each element, iterate its
 * bounding box in resolution-sized steps. Cells at the same grid coordinate
 * are merged — element GUIDs accumulate in the ifcElements array.
 *
 * If the estimated cell count exceeds MAX_CELLS (500K), the resolution is
 * automatically increased (coarsened) to fit within the cap.
 *
 * @param elements - Array of BoxElement with mm-coordinate bounding boxes
 * @param resolution - Cell edge length in millimetres (default 100 = COARSE)
 * @returns Object containing the deduplicated BoxCell array
 */
export function rasterizeElements(
  elements: BoxElement[],
  resolution: number,
): { voxels: BoxCell[] } {
  let gMinX = Infinity, gMinY = Infinity, gMinZ = Infinity;
  let gMaxX = -Infinity, gMaxY = -Infinity, gMaxZ = -Infinity;

  for (const el of elements) {
    if (!el.boundingBox) continue;
    const { min, max } = el.boundingBox;
    gMinX = Math.min(gMinX, min.x); gMinY = Math.min(gMinY, min.y); gMinZ = Math.min(gMinZ, min.z);
    gMaxX = Math.max(gMaxX, max.x); gMaxY = Math.max(gMaxY, max.y); gMaxZ = Math.max(gMaxZ, max.z);
  }

  // Padding
  const pad = resolution * 2;
  gMinX -= pad; gMinY -= pad; gMinZ -= pad;
  gMaxX += pad; gMaxY += pad; gMaxZ += pad;

  // Safety: cap total grid cells to prevent stack overflow
  let effectiveRes = resolution;
  const xSteps = Math.ceil((gMaxX - gMinX) / effectiveRes);
  const ySteps = Math.ceil((gMaxY - gMinY) / effectiveRes);
  const zSteps = Math.ceil((gMaxZ - gMinZ) / effectiveRes);
  const estimatedCells = xSteps * ySteps * zSteps;
  if (estimatedCells > MAX_CELLS) {
    const volume = (gMaxX - gMinX) * (gMaxY - gMinY) * (gMaxZ - gMinZ);
    effectiveRes = Math.cbrt(volume / MAX_CELLS);
    console.log(`[BOX:rasterizer] Auto-coarsened: ${resolution}mm → ${Math.round(effectiveRes)}mm (estimated ${estimatedCells} cells > ${MAX_CELLS} cap)`);
  }
  const res = effectiveRes;

  // Track occupied cells and their contributing element IDs
  const cellMap = new Map<string, Set<string>>();

  for (const el of elements) {
    if (!el.boundingBox) continue;
    const { min, max } = el.boundingBox;
    const i0 = Math.floor((min.x - gMinX) / res);
    const i1 = Math.ceil((max.x - gMinX) / res);
    const j0 = Math.floor((min.y - gMinY) / res);
    const j1 = Math.ceil((max.y - gMinY) / res);
    const k0 = Math.floor((min.z - gMinZ) / res);
    const k1 = Math.ceil((max.z - gMinZ) / res);

    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        for (let k = k0; k <= k1; k++) {
          const key = `${i},${j},${k}`;
          if (!cellMap.has(key)) cellMap.set(key, new Set());
          cellMap.get(key)!.add(el.globalId);
        }
      }
    }
  }

  // Convert occupied cells to BoxCell array
  const voxels: BoxCell[] = [];
  for (const [key, ids] of cellMap.entries()) {
    const [i, j, k] = key.split(',').map(Number);
    const primaryId = ids.values().next().value!;
    const primaryEl = elements.find(e => e.globalId === primaryId);
    if (!primaryEl) continue;

    voxels.push({
      center: {
        x: gMinX + (i + 0.5) * res,
        y: gMinY + (j + 0.5) * res,
        z: gMinZ + (k + 0.5) * res,
      },
      bounds: {
        min: { x: gMinX + i * res, y: gMinY + j * res, z: gMinZ + k * res },
        max: { x: gMinX + (i + 1) * res, y: gMinY + (j + 1) * res, z: gMinZ + (k + 1) * res },
      },
      system: classifySystem(primaryEl.type),
      level: primaryEl.containedInStorey || 'Unknown',
      ifcElements: [...ids],
    });
  }

  return { voxels };
}
