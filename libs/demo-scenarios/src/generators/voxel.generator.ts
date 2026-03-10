/**
 * ============================================================================
 * VOXEL & SPATIAL DATA GENERATOR
 * ============================================================================
 * Generates realistic 3D voxel grids for construction scenarios,
 * following the SDI (Spatial Decision Intelligence) model.
 *
 * @module @ectropy/demo-scenarios/generators
 * @version 1.0.0
 * ============================================================================
 */

// import { v4 as uuidv4 } from 'uuid'; // Unused import
import type {
  VoxelDefinition,
  VoxelStatus,
  BuildingType,
} from '../types/index.js';

// ============================================================================
// BUILDING CONFIGURATIONS
// ============================================================================

/**
 * Building dimension profiles for voxel generation
 */
export interface BuildingDimensions {
  width: number; // X dimension (meters)
  depth: number; // Y dimension (meters)
  height: number; // Z dimension per floor (meters)
  levels: number; // Number of floors
  zones: ZoneDefinition[];
}

/**
 * Zone definition within a building
 */
export interface ZoneDefinition {
  name: string;
  level: number;
  gridStart: { x: number; y: number };
  gridEnd: { x: number; y: number };
  system?: string;
  voxelPrefix: string;
}

/**
 * Standard building dimension profiles
 */
export const buildingProfiles: Record<BuildingType, BuildingDimensions> = {
  house: {
    width: 12,
    depth: 10,
    height: 3,
    levels: 2,
    zones: [
      {
        name: 'Foundation',
        level: 0,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 12, y: 10 },
        voxelPrefix: 'FND',
      },
      {
        name: 'Living',
        level: 1,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 8, y: 10 },
        voxelPrefix: 'LIV',
      },
      {
        name: 'Kitchen',
        level: 1,
        gridStart: { x: 8, y: 0 },
        gridEnd: { x: 12, y: 6 },
        voxelPrefix: 'KIT',
      },
      {
        name: 'Garage',
        level: 1,
        gridStart: { x: 8, y: 6 },
        gridEnd: { x: 12, y: 10 },
        voxelPrefix: 'GAR',
      },
      {
        name: 'Master',
        level: 2,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 6, y: 6 },
        voxelPrefix: 'MBR',
      },
      {
        name: 'Bedroom2',
        level: 2,
        gridStart: { x: 6, y: 0 },
        gridEnd: { x: 12, y: 5 },
        voxelPrefix: 'BR2',
      },
      {
        name: 'Bathroom',
        level: 2,
        gridStart: { x: 6, y: 5 },
        gridEnd: { x: 12, y: 10 },
        voxelPrefix: 'BTH',
      },
      {
        name: 'Roof',
        level: 2,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 12, y: 10 },
        voxelPrefix: 'ROF',
      },
    ],
  },
  duplex: {
    width: 20,
    depth: 12,
    height: 3,
    levels: 2,
    zones: [
      {
        name: 'Foundation',
        level: 0,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 20, y: 12 },
        voxelPrefix: 'FND',
      },
      {
        name: 'PartyWall',
        level: 1,
        gridStart: { x: 9, y: 0 },
        gridEnd: { x: 11, y: 12 },
        voxelPrefix: 'PARTY',
      },
      {
        name: 'UnitA-Living',
        level: 1,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 9, y: 8 },
        voxelPrefix: 'A-LIV',
      },
      {
        name: 'UnitA-Kitchen',
        level: 1,
        gridStart: { x: 0, y: 8 },
        gridEnd: { x: 9, y: 12 },
        voxelPrefix: 'A-KIT',
      },
      {
        name: 'UnitB-Living',
        level: 1,
        gridStart: { x: 11, y: 0 },
        gridEnd: { x: 20, y: 8 },
        voxelPrefix: 'B-LIV',
      },
      {
        name: 'UnitB-Kitchen',
        level: 1,
        gridStart: { x: 11, y: 8 },
        gridEnd: { x: 20, y: 12 },
        voxelPrefix: 'B-KIT',
      },
      {
        name: 'PartyWall-L2',
        level: 2,
        gridStart: { x: 9, y: 0 },
        gridEnd: { x: 11, y: 12 },
        voxelPrefix: 'PARTY',
      },
      {
        name: 'UnitA-Master',
        level: 2,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 9, y: 6 },
        voxelPrefix: 'A-MBR',
      },
      {
        name: 'UnitA-Bath',
        level: 2,
        gridStart: { x: 0, y: 6 },
        gridEnd: { x: 9, y: 12 },
        voxelPrefix: 'A-BTH',
      },
      {
        name: 'UnitB-Master',
        level: 2,
        gridStart: { x: 11, y: 0 },
        gridEnd: { x: 20, y: 6 },
        voxelPrefix: 'B-MBR',
      },
      {
        name: 'UnitB-Bath',
        level: 2,
        gridStart: { x: 11, y: 6 },
        gridEnd: { x: 20, y: 12 },
        voxelPrefix: 'B-BTH',
      },
    ],
  },
  office: {
    width: 30,
    depth: 20,
    height: 4,
    levels: 5,
    zones: [
      {
        name: 'Foundation',
        level: 0,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 30, y: 20 },
        voxelPrefix: 'FND',
      },
      {
        name: 'Lobby',
        level: 1,
        gridStart: { x: 10, y: 0 },
        gridEnd: { x: 20, y: 8 },
        voxelPrefix: 'LBY',
      },
      {
        name: 'Core',
        level: 1,
        gridStart: { x: 12, y: 8 },
        gridEnd: { x: 18, y: 14 },
        system: 'MEP',
        voxelPrefix: 'CORE',
      },
      {
        name: 'OpenOffice',
        level: 2,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 30, y: 20 },
        voxelPrefix: 'OFF',
      },
      {
        name: 'Core-L2',
        level: 2,
        gridStart: { x: 12, y: 8 },
        gridEnd: { x: 18, y: 14 },
        system: 'MEP',
        voxelPrefix: 'CORE',
      },
      {
        name: 'OpenOffice-L3',
        level: 3,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 30, y: 20 },
        voxelPrefix: 'OFF',
      },
      {
        name: 'Core-L3',
        level: 3,
        gridStart: { x: 12, y: 8 },
        gridEnd: { x: 18, y: 14 },
        system: 'MEP',
        voxelPrefix: 'CORE',
      },
      {
        name: 'OpenOffice-L4',
        level: 4,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 30, y: 20 },
        voxelPrefix: 'OFF',
      },
      {
        name: 'Core-L4',
        level: 4,
        gridStart: { x: 12, y: 8 },
        gridEnd: { x: 18, y: 14 },
        system: 'MEP',
        voxelPrefix: 'CORE',
      },
      {
        name: 'Penthouse',
        level: 5,
        gridStart: { x: 5, y: 5 },
        gridEnd: { x: 25, y: 15 },
        voxelPrefix: 'PH',
      },
      {
        name: 'Mechanical',
        level: 5,
        gridStart: { x: 10, y: 16 },
        gridEnd: { x: 20, y: 20 },
        system: 'HVAC',
        voxelPrefix: 'MECH',
      },
    ],
  },
  commercial: {
    width: 50,
    depth: 40,
    height: 5,
    levels: 3,
    zones: [
      {
        name: 'Foundation',
        level: 0,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 50, y: 40 },
        voxelPrefix: 'FND',
      },
      {
        name: 'Retail-A',
        level: 1,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 25, y: 20 },
        voxelPrefix: 'RET-A',
      },
      {
        name: 'Retail-B',
        level: 1,
        gridStart: { x: 25, y: 0 },
        gridEnd: { x: 50, y: 20 },
        voxelPrefix: 'RET-B',
      },
      {
        name: 'Loading',
        level: 1,
        gridStart: { x: 0, y: 30 },
        gridEnd: { x: 50, y: 40 },
        voxelPrefix: 'LOAD',
      },
      {
        name: 'Warehouse',
        level: 1,
        gridStart: { x: 0, y: 20 },
        gridEnd: { x: 50, y: 30 },
        voxelPrefix: 'WH',
      },
      {
        name: 'Mezzanine',
        level: 2,
        gridStart: { x: 10, y: 5 },
        gridEnd: { x: 40, y: 15 },
        voxelPrefix: 'MEZ',
      },
      {
        name: 'Mechanical-L2',
        level: 2,
        gridStart: { x: 20, y: 35 },
        gridEnd: { x: 30, y: 40 },
        system: 'HVAC',
        voxelPrefix: 'MECH',
      },
      {
        name: 'Rooftop',
        level: 3,
        gridStart: { x: 0, y: 0 },
        gridEnd: { x: 50, y: 40 },
        voxelPrefix: 'ROOF',
      },
      {
        name: 'RTU-Area',
        level: 3,
        gridStart: { x: 15, y: 15 },
        gridEnd: { x: 35, y: 25 },
        system: 'HVAC',
        voxelPrefix: 'RTU',
      },
    ],
  },
};

// ============================================================================
// VOXEL GENERATION
// ============================================================================

/**
 * Options for voxel generation
 */
export interface VoxelGeneratorOptions {
  projectId: string;
  buildingType: BuildingType;
  resolution?: number; // Voxel size in meters (default: 1.0)
  includeAllZones?: boolean;
  targetCount?: number; // Approximate number of voxels to generate
  statusDistribution?: Partial<Record<VoxelStatus, number>>; // Percentage for each status
}

/**
 * Generates a grid reference string from coordinates
 */
function generateGridReference(x: number, y: number): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Skip I and O (similar to numbers)
  const col = letters[Math.floor(x) % letters.length];
  const row = Math.floor(y) + 1;
  return `${col}-${row}`;
}

/**
 * Generates voxels for a specific zone
 */
function generateZoneVoxels(
  zone: ZoneDefinition,
  projectId: string,
  buildingName: string,
  resolution: number,
  statusDistribution: Record<VoxelStatus, number>
): VoxelDefinition[] {
  const voxels: VoxelDefinition[] = [];
  const zHeight = zone.level * 3; // Assume 3m floor height

  // Calculate voxel grid for zone
  const xCount = Math.ceil((zone.gridEnd.x - zone.gridStart.x) / resolution);
  const yCount = Math.ceil((zone.gridEnd.y - zone.gridStart.y) / resolution);

  // Generate voxels
  for (let xi = 0; xi < xCount; xi++) {
    for (let yi = 0; yi < yCount; yi++) {
      const x = zone.gridStart.x + xi * resolution;
      const y = zone.gridStart.y + yi * resolution;
      const z = zHeight;

      const id = `${zone.voxelPrefix}-${String(xi).padStart(2, '0')}${String(yi).padStart(2, '0')}`;

      // Determine status based on distribution
      const random = Math.random();
      let cumulativeProb = 0;
      let status: VoxelStatus = 'PLANNED';
      for (const [s, prob] of Object.entries(statusDistribution)) {
        cumulativeProb += prob;
        if (random < cumulativeProb) {
          status = s as VoxelStatus;
          break;
        }
      }

      voxels.push({
        id,
        urn: `urn:ectropy:${projectId}:voxel:${id}`,
        status,
        coordinates: {
          x: x + resolution / 2,
          y: y + resolution / 2,
          z: z + resolution / 2,
        },
        bounds: {
          minX: x,
          maxX: x + resolution,
          minY: y,
          maxY: y + resolution,
          minZ: z,
          maxZ: z + resolution,
        },
        resolution,
        location: {
          building: buildingName,
          level: `Level ${zone.level}`,
          zone: zone.name,
          gridReference: generateGridReference(x, y),
        },
        system: zone.system,
      });
    }
  }

  return voxels;
}

/**
 * Generates a complete voxel grid for a building
 */
export function generateBuildingVoxels(
  options: VoxelGeneratorOptions
): VoxelDefinition[] {
  const profile = buildingProfiles[options.buildingType];
  if (!profile) {
    throw new Error(`Unknown building type: ${options.buildingType}`);
  }

  const resolution = options.resolution || 1.0;
  const statusDistribution: Record<VoxelStatus, number> = {
    PLANNED: options.statusDistribution?.PLANNED ?? 0.6,
    IN_PROGRESS: options.statusDistribution?.IN_PROGRESS ?? 0.2,
    COMPLETED: options.statusDistribution?.COMPLETED ?? 0.15,
    ON_HOLD: options.statusDistribution?.ON_HOLD ?? 0.03,
    BLOCKED: options.statusDistribution?.BLOCKED ?? 0.02,
  };

  const buildingNames: Record<BuildingType, string> = {
    house: 'Modern Residence',
    duplex: 'Urban Duplex',
    office: 'Office Tower',
    commercial: 'Commercial Center',
  };

  let allVoxels: VoxelDefinition[] = [];

  // Generate voxels for each zone
  for (const zone of profile.zones) {
    const zoneVoxels = generateZoneVoxels(
      zone,
      options.projectId,
      buildingNames[options.buildingType],
      resolution,
      statusDistribution
    );
    allVoxels = allVoxels.concat(zoneVoxels);
  }

  // If targetCount specified, randomly sample to that size
  if (options.targetCount && options.targetCount < allVoxels.length) {
    // Shuffle and take first targetCount
    for (let i = allVoxels.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allVoxels[i], allVoxels[j]] = [allVoxels[j], allVoxels[i]];
    }
    allVoxels = allVoxels.slice(0, options.targetCount);
  }

  return allVoxels;
}

/**
 * Gets voxels for a specific zone
 */
export function getVoxelsForZone(
  allVoxels: VoxelDefinition[],
  zoneName: string
): VoxelDefinition[] {
  return allVoxels.filter((v) => v.location.zone === zoneName);
}

/**
 * Gets voxels for a specific level
 */
export function getVoxelsForLevel(
  allVoxels: VoxelDefinition[],
  levelNumber: number
): VoxelDefinition[] {
  return allVoxels.filter((v) => v.location.level === `Level ${levelNumber}`);
}

/**
 * Gets voxels with a specific status
 */
export function getVoxelsByStatus(
  allVoxels: VoxelDefinition[],
  status: VoxelStatus
): VoxelDefinition[] {
  return allVoxels.filter((v) => v.status === status);
}

/**
 * Updates voxel status (for timeline progression)
 */
export function updateVoxelStatus(
  voxel: VoxelDefinition,
  newStatus: VoxelStatus
): VoxelDefinition {
  return {
    ...voxel,
    status: newStatus,
  };
}

/**
 * Generates adjacent voxel IDs for a given voxel
 */
export function getAdjacentVoxels(
  voxel: VoxelDefinition,
  allVoxels: VoxelDefinition[]
): VoxelDefinition[] {
  const resolution = voxel.resolution;
  const tolerance = resolution * 0.1; // 10% tolerance for floating point

  return allVoxels.filter((v) => {
    if (v.id === voxel.id) return false;

    const dx = Math.abs(v.coordinates.x - voxel.coordinates.x);
    const dy = Math.abs(v.coordinates.y - voxel.coordinates.y);
    const dz = Math.abs(v.coordinates.z - voxel.coordinates.z);

    // Adjacent if touching on exactly one axis
    const touchingX =
      Math.abs(dx - resolution) < tolerance && dy < tolerance && dz < tolerance;
    const touchingY =
      dx < tolerance && Math.abs(dy - resolution) < tolerance && dz < tolerance;
    const touchingZ =
      dx < tolerance && dy < tolerance && Math.abs(dz - resolution) < tolerance;

    return touchingX || touchingY || touchingZ;
  });
}
