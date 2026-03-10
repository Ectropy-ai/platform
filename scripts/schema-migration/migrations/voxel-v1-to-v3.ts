/**
 * Voxel Schema Migration: V1 -> V3
 *
 * Transforms voxel/BIM data from V1 format to V3 format with:
 * - URN identifiers ($id)
 * - Graph metadata for spatial relationships
 * - Decision surface attachment points
 * - Schema version tracking
 */

import {
  registerMigration,
  generateUrn,
} from '../migrate';

// V1 Voxel structure (legacy)
interface VoxelV1 {
  id: string;
  modelId: string;
  speckleId?: string;
  name: string;
  type: string;
  category?: string;
  level?: string;
  zone?: string;
  boundingBox?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  volume?: number;
  area?: number;
  material?: string;
  properties?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

// V3 Voxel structure (current)
interface VoxelV3 {
  $schema: string;
  $id: string;
  schemaVersion: string;
  id: string;
  modelUrn: string;
  speckleReference?: {
    streamId: string;
    objectId: string;
    commitId?: string;
  };
  identity: {
    name: string;
    type: string;
    category: string;
    level?: string;
    zone?: string;
  };
  geometry: {
    boundingBox: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    };
    centroid: { x: number; y: number; z: number };
    volume?: number;
    area?: number;
  };
  material?: {
    name: string;
    properties?: Record<string, unknown>;
  };
  decisionSurface: {
    enabled: boolean;
    attachedDecisions: string[];
    attachmentZone: {
      radius: number;
      priority: number;
    };
  };
  metadata: {
    properties: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    sourceSystem: string;
  };
  graphMetadata: {
    nodeType: string;
    inEdges: Array<{ type: string; target: string }>;
    outEdges: Array<{ type: string; target: string }>;
  };
}

/**
 * Calculate centroid from bounding box
 */
function calculateCentroid(boundingBox: VoxelV1['boundingBox']): { x: number; y: number; z: number } {
  if (!boundingBox) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: (boundingBox.min.x + boundingBox.max.x) / 2,
    y: (boundingBox.min.y + boundingBox.max.y) / 2,
    z: (boundingBox.min.z + boundingBox.max.z) / 2,
  };
}

/**
 * Infer category from type if not provided
 */
function inferCategory(type: string, category?: string): string {
  if (category) return category;

  const typeCategories: Record<string, string> = {
    wall: 'Walls',
    floor: 'Floors',
    ceiling: 'Ceilings',
    roof: 'Roofs',
    column: 'Structural Framing',
    beam: 'Structural Framing',
    door: 'Doors',
    window: 'Windows',
    pipe: 'Plumbing',
    duct: 'Mechanical',
    conduit: 'Electrical',
    equipment: 'Mechanical Equipment',
  };

  return typeCategories[type.toLowerCase()] || 'Generic Models';
}

/**
 * Migrate a V1 voxel to V3 format
 */
function migrateVoxelV1ToV3(v1: VoxelV1): VoxelV3 {
  const urn = generateUrn('ectropy', 'voxel', v1.id);
  const modelUrn = generateUrn('ectropy', 'model', v1.modelId);

  const defaultBoundingBox = {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 1, y: 1, z: 1 },
  };

  const v3: VoxelV3 = {
    $schema: '../../schemas/voxel/voxel-v3.schema.json',
    $id: urn,
    schemaVersion: '3.0.0',
    id: v1.id,
    modelUrn,
    ...(v1.speckleId && {
      speckleReference: {
        streamId: v1.modelId,
        objectId: v1.speckleId,
      },
    }),
    identity: {
      name: v1.name,
      type: v1.type,
      category: inferCategory(v1.type, v1.category),
      ...(v1.level && { level: v1.level }),
      ...(v1.zone && { zone: v1.zone }),
    },
    geometry: {
      boundingBox: v1.boundingBox || defaultBoundingBox,
      centroid: calculateCentroid(v1.boundingBox),
      ...(v1.volume && { volume: v1.volume }),
      ...(v1.area && { area: v1.area }),
    },
    ...(v1.material && {
      material: {
        name: v1.material,
        properties: {},
      },
    }),
    decisionSurface: {
      enabled: true,
      attachedDecisions: [],
      attachmentZone: {
        radius: 5.0, // 5 meter default attachment radius
        priority: 50, // Medium priority
      },
    },
    metadata: {
      properties: v1.properties || {},
      createdAt: v1.createdAt,
      updatedAt: v1.updatedAt || v1.createdAt,
      sourceSystem: 'migration-v1-to-v3',
    },
    graphMetadata: {
      nodeType: 'Voxel',
      inEdges: [{ type: 'BELONGS_TO', target: modelUrn }],
      outEdges: [],
    },
  };

  // Add spatial relationships based on level/zone
  if (v1.level) {
    v3.graphMetadata.outEdges.push({
      type: 'LOCATED_ON',
      target: generateUrn('ectropy', 'level', v1.level.toLowerCase().replace(/\s+/g, '-')),
    });
  }

  if (v1.zone) {
    v3.graphMetadata.outEdges.push({
      type: 'WITHIN_ZONE',
      target: generateUrn('ectropy', 'zone', v1.zone.toLowerCase().replace(/\s+/g, '-')),
    });
  }

  return v3;
}

// Register the migration
registerMigration({
  name: 'voxel-v1-to-v3',
  schema: 'voxel',
  sourceVersion: 'v1',
  targetVersion: 'v3',
  migrate: migrateVoxelV1ToV3,
  validate: (data) => {
    const v3 = data as VoxelV3;
    return !!(
      v3.$id &&
      v3.$id.startsWith('urn:luhtech:') &&
      v3.schemaVersion === '3.0.0' &&
      v3.graphMetadata?.nodeType === 'Voxel' &&
      v3.geometry?.boundingBox &&
      v3.decisionSurface?.enabled !== undefined
    );
  },
});

console.log('Loaded migration: voxel-v1-to-v3');
