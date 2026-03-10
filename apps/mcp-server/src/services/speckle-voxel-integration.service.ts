/**
 * Speckle-Voxel Integration Service
 *
 * Bridges the Speckle/IFC integration with the voxel decomposition engine.
 * Provides enterprise-grade conversion from Speckle BIM objects to voxel grids.
 *
 * Integration Flow:
 * 1. IFC Upload → Speckle Stream → Database (construction_elements)
 * 2. Database → IFCElement Extraction → Bounding Box Calculation
 * 3. IFCElement[] → Voxel Decomposition → Voxel Grid + Octree
 * 4. Voxel Grid → Prisma Persistence → Real-time Coordination
 *
 * @module services/speckle-voxel-integration
 * @version 1.0.0
 */

// Dynamic Prisma types - will be available after prisma generate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClient = any;
import {
  VoxelDecompositionService,
  createVoxelDecompositionService,
} from './voxel-decomposition.service';
import {
  IFCElement,
  IFCMaterial,
  IFCEntityCategory,
  VoxelizationConfig,
  VoxelizationResult,
  VoxelResolution,
  BoundingBox,
  Vector3,
} from '../types/voxel-decomposition.types';

// ==============================================================================
// Types
// ==============================================================================

/**
 * Speckle object as stored in construction_elements table
 */
export interface SpeckleElementRecord {
  id: string;
  project_id: string;
  ifc_id: string;
  element_type: string;
  element_name?: string;
  properties: SpeckleProperties;
  created_at: Date;
  updated_at: Date;
}

/**
 * Properties structure from Speckle/IFC parsing
 */
export interface SpeckleProperties {
  name?: string;
  ifcType?: string;
  speckle_type?: string;
  geometry?: SpeckleGeometry;
  materials?: string[];
  relationships?: {
    containedIn?: string;
    contains?: string[];
    connectedTo?: string[];
  };
  psets?: Record<string, unknown>;
  quantities?: Record<string, number>;
  boundingBox?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  // IFC-specific properties
  GlobalId?: string;
  ObjectType?: string;
  Description?: string;
  Tag?: string;
  // Dimensions
  width?: number;
  height?: number;
  length?: number;
  thickness?: number;
  volume?: number;
  area?: number;
  // Location
  level?: string;
  storey?: string;
  zone?: string;
  space?: string;
}

/**
 * Geometry data from IFC parsing
 */
export interface SpeckleGeometry {
  type: string;
  coordinates?: number[][];
  vertices?: number[];
  faces?: number[];
  volume?: number;
  area?: number;
  boundingBox?: BoundingBox;
}

/**
 * Result of Speckle to voxel conversion
 */
export interface SpeckleVoxelResult {
  success: boolean;
  projectId: string;
  elementsProcessed: number;
  elementsSkipped: number;
  voxelizationResult?: VoxelizationResult;
  errors: SpeckleVoxelError[];
  warnings: string[];
}

/**
 * Error during conversion
 */
export interface SpeckleVoxelError {
  code: string;
  message: string;
  elementId?: string;
  details?: Record<string, unknown>;
}

/**
 * Options for Speckle-Voxel integration
 */
export interface SpeckleVoxelOptions {
  resolution?: VoxelResolution | number;
  includePartial?: boolean;
  minOccupancy?: number;
  defaultBoundingBoxSize?: number;
  estimateBoundsFromDimensions?: boolean;
}

// ==============================================================================
// Default Configuration
// ==============================================================================

const DEFAULT_OPTIONS: SpeckleVoxelOptions = {
  resolution: VoxelResolution.STANDARD,
  includePartial: true,
  minOccupancy: 0.1,
  defaultBoundingBoxSize: 1000, // 1m default if no bounds available
  estimateBoundsFromDimensions: true,
};

// ==============================================================================
// IFC Type Mapping
// ==============================================================================

/**
 * Map IFC type strings to IFCEntityCategory
 */
function mapIFCType(ifcType: string): IFCEntityCategory {
  const typeMap: Record<string, IFCEntityCategory> = {
    // Structural
    'IFCWALL': IFCEntityCategory.WALL,
    'IFCWALLSTANDARDCASE': IFCEntityCategory.WALL,
    'IFCCURTAINWALL': IFCEntityCategory.CURTAIN_WALL,
    'IFCSLAB': IFCEntityCategory.SLAB,
    'IFCCOLUMN': IFCEntityCategory.COLUMN,
    'IFCBEAM': IFCEntityCategory.BEAM,
    'IFCROOF': IFCEntityCategory.ROOF,
    'IFCSTAIR': IFCEntityCategory.STAIR,
    'IFCRAMP': IFCEntityCategory.RAMP,
    'IFCRAILING': IFCEntityCategory.RAILING,

    // Openings
    'IFCDOOR': IFCEntityCategory.DOOR,
    'IFCWINDOW': IFCEntityCategory.WINDOW,

    // Covering & Finishing
    'IFCCOVERING': IFCEntityCategory.COVERING,

    // Furnishing
    'IFCFURNISHINGELEMENT': IFCEntityCategory.FURNISHING,
    'IFCFURNITURE': IFCEntityCategory.FURNISHING,

    // MEP Distribution
    'IFCDISTRIBUTIONELEMENT': IFCEntityCategory.DISTRIBUTION_ELEMENT,
    'IFCFLOWCONTROLLER': IFCEntityCategory.DISTRIBUTION_ELEMENT,
    'IFCFLOWFITTING': IFCEntityCategory.FLOW_FITTING,
    'IFCFLOWSEGMENT': IFCEntityCategory.FLOW_SEGMENT,
    'IFCFLOWTERMINAL': IFCEntityCategory.FLOW_TERMINAL,
    'IFCPIPESEGMENT': IFCEntityCategory.FLOW_SEGMENT,
    'IFCPIPEFITTING': IFCEntityCategory.FLOW_FITTING,
    'IFCDUCTSEGMENT': IFCEntityCategory.FLOW_SEGMENT,
    'IFCDUCTFITTING': IFCEntityCategory.FLOW_FITTING,
    'IFCCABLECARRIERSEGMENT': IFCEntityCategory.FLOW_SEGMENT,
    'IFCCABLESEGMENT': IFCEntityCategory.FLOW_SEGMENT,

    // Spatial
    'IFCSPACE': IFCEntityCategory.SPACE,
    'IFCBUILDINGSTOREY': IFCEntityCategory.BUILDING_STOREY,
    'IFCBUILDING': IFCEntityCategory.BUILDING,
    'IFCSITE': IFCEntityCategory.SITE,
  };

  const normalizedType = ifcType.toUpperCase().replace(/[^A-Z]/g, '');
  return typeMap[normalizedType] || IFCEntityCategory.UNKNOWN;
}

/**
 * Map Speckle type strings to IFC categories
 */
function mapSpeckleType(speckleType: string): IFCEntityCategory {
  const typeMap: Record<string, IFCEntityCategory> = {
    'Objects.BuiltElements.Wall': IFCEntityCategory.WALL,
    'Objects.BuiltElements.Floor': IFCEntityCategory.SLAB,
    'Objects.BuiltElements.Column': IFCEntityCategory.COLUMN,
    'Objects.BuiltElements.Beam': IFCEntityCategory.BEAM,
    'Objects.BuiltElements.Roof': IFCEntityCategory.ROOF,
    'Objects.BuiltElements.Door': IFCEntityCategory.DOOR,
    'Objects.BuiltElements.Window': IFCEntityCategory.WINDOW,
    'Objects.BuiltElements.Stair': IFCEntityCategory.STAIR,
    'Objects.BuiltElements.Ramp': IFCEntityCategory.RAMP,
    'Objects.BuiltElements.Railing': IFCEntityCategory.RAILING,
    'Objects.BuiltElements.Duct': IFCEntityCategory.FLOW_SEGMENT,
    'Objects.BuiltElements.Pipe': IFCEntityCategory.FLOW_SEGMENT,
    'Objects.BuiltElements.CableTray': IFCEntityCategory.FLOW_SEGMENT,
    'Objects.BuiltElements.Room': IFCEntityCategory.SPACE,
    'Objects.BuiltElements.Level': IFCEntityCategory.BUILDING_STOREY,
  };

  return typeMap[speckleType] || IFCEntityCategory.UNKNOWN;
}

// ==============================================================================
// Bounding Box Extraction
// ==============================================================================

/**
 * Extract or estimate bounding box from Speckle element properties
 */
function extractBoundingBox(
  props: SpeckleProperties,
  options: SpeckleVoxelOptions
): BoundingBox | null {
  // Priority 1: Explicit bounding box
  if (props.boundingBox) {
    return props.boundingBox;
  }

  // Priority 2: Geometry bounding box
  if (props.geometry?.boundingBox) {
    return props.geometry.boundingBox;
  }

  // Priority 3: Estimate from geometry coordinates
  if (props.geometry?.vertices && props.geometry.vertices.length >= 6) {
    const vertices = props.geometry.vertices;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < vertices.length; i += 3) {
      minX = Math.min(minX, vertices[i]);
      maxX = Math.max(maxX, vertices[i]);
      minY = Math.min(minY, vertices[i + 1]);
      maxY = Math.max(maxY, vertices[i + 1]);
      minZ = Math.min(minZ, vertices[i + 2]);
      maxZ = Math.max(maxZ, vertices[i + 2]);
    }

    if (isFinite(minX) && isFinite(maxX)) {
      return {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
      };
    }
  }

  // Priority 4: Estimate from GeoJSON-style coordinates
  if (props.geometry?.coordinates) {
    const coords = props.geometry.coordinates.flat(2);
    if (coords.length >= 3) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

      for (let i = 0; i < coords.length; i += 3) {
        minX = Math.min(minX, coords[i]);
        maxX = Math.max(maxX, coords[i]);
        minY = Math.min(minY, coords[i + 1] || 0);
        maxY = Math.max(maxY, coords[i + 1] || 0);
        minZ = Math.min(minZ, coords[i + 2] || 0);
        maxZ = Math.max(maxZ, coords[i + 2] || 0);
      }

      if (isFinite(minX) && isFinite(maxX)) {
        return {
          min: { x: minX, y: minY, z: minZ },
          max: { x: maxX, y: maxY, z: maxZ },
        };
      }
    }
  }

  // Priority 5: Estimate from dimensions if enabled
  if (options.estimateBoundsFromDimensions) {
    const width = props.width || props.length || options.defaultBoundingBoxSize;
    const height = props.height || options.defaultBoundingBoxSize;
    const thickness = props.thickness || 200; // Default 200mm thickness

    if (width && height) {
      // Assume origin at (0,0,0) and extend in positive direction
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: width, y: thickness, z: height },
      };
    }
  }

  // No bounding box available
  return null;
}

/**
 * Extract material information from Speckle properties
 */
function extractMaterials(props: SpeckleProperties): IFCMaterial[] {
  const materials: IFCMaterial[] = [];

  if (props.materials && Array.isArray(props.materials)) {
    for (const mat of props.materials) {
      if (typeof mat === 'string') {
        materials.push({ name: mat });
      } else if (mat && typeof mat === 'object') {
        materials.push({
          name: (mat as any).name || 'Unknown',
          category: (mat as any).category,
          thickness: (mat as any).thickness,
          volume: (mat as any).volume,
          area: (mat as any).area,
          density: (mat as any).density,
          properties: mat,
        });
      }
    }
  }

  // If no materials, try to infer from element type
  if (materials.length === 0) {
    const ifcType = (props.ifcType || '').toUpperCase();
    if (ifcType.includes('WALL') || ifcType.includes('SLAB') || ifcType.includes('COLUMN')) {
      materials.push({ name: 'Concrete' });
    } else if (ifcType.includes('PIPE')) {
      materials.push({ name: 'Steel' });
    } else if (ifcType.includes('DUCT')) {
      materials.push({ name: 'Sheet Metal' });
    } else if (ifcType.includes('CABLE')) {
      materials.push({ name: 'Copper' });
    }
  }

  return materials.length > 0 ? materials : [{ name: 'Unknown' }];
}

/**
 * Extract level/storey information from properties
 */
function extractLevel(props: SpeckleProperties): string | undefined {
  return (
    props.level ||
    props.storey ||
    props.relationships?.containedIn ||
    undefined
  );
}

// ==============================================================================
// Main Service Class
// ==============================================================================

/**
 * Speckle-Voxel Integration Service
 *
 * Provides seamless integration between Speckle BIM objects and
 * the voxel decomposition engine for spatial decision attachment.
 */
export class SpeckleVoxelIntegrationService {
  private prisma: PrismaClient;
  private voxelService: VoxelDecompositionService;
  private options: SpeckleVoxelOptions;

  constructor(
    prisma: PrismaClient,
    options?: Partial<SpeckleVoxelOptions>
  ) {
    this.prisma = prisma;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.voxelService = createVoxelDecompositionService({
      resolution: this.options.resolution,
      includePartial: this.options.includePartial,
      minOccupancy: this.options.minOccupancy,
    });
  }

  /**
   * Voxelize elements from database for a project
   *
   * This fetches construction_elements from PostgreSQL,
   * transforms them to IFCElement format, and voxelizes.
   */
  async voxelizeProjectElements(
    projectId: string,
    modelId?: string
  ): Promise<SpeckleVoxelResult> {
    const errors: SpeckleVoxelError[] = [];
    const warnings: string[] = [];

    try {
      // Fetch elements from database
      const elements = await this.fetchProjectElements(projectId);

      if (elements.length === 0) {
        return {
          success: false,
          projectId,
          elementsProcessed: 0,
          elementsSkipped: 0,
          errors: [{ code: 'NO_ELEMENTS', message: 'No elements found for project' }],
          warnings: [],
        };
      }

      // Transform to IFCElement format
      const { ifcElements, skipped, transformErrors } = this.transformToIFCElements(elements);

      errors.push(...transformErrors);

      if (ifcElements.length === 0) {
        return {
          success: false,
          projectId,
          elementsProcessed: 0,
          elementsSkipped: skipped,
          errors: [...errors, { code: 'NO_VALID_ELEMENTS', message: 'No elements with valid geometry found' }],
          warnings,
        };
      }

      // Voxelize
      const voxelResult = await this.voxelService.voxelizeFromElements(
        projectId,
        modelId || `model-${Date.now()}`,
        ifcElements
      );

      return {
        success: voxelResult.success,
        projectId,
        elementsProcessed: ifcElements.length,
        elementsSkipped: skipped,
        voxelizationResult: voxelResult,
        errors: [...errors, ...voxelResult.errors],
        warnings: [...warnings, ...voxelResult.warnings],
      };
    } catch (error) {
      return {
        success: false,
        projectId,
        elementsProcessed: 0,
        elementsSkipped: 0,
        errors: [{
          code: 'VOXELIZATION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        }],
        warnings,
      };
    }
  }

  /**
   * Voxelize directly from Speckle stream
   *
   * Fetches objects from Speckle API and voxelizes them.
   */
  async voxelizeFromSpeckleStream(
    projectId: string,
    streamId: string,
    commitId?: string
  ): Promise<SpeckleVoxelResult> {
    const errors: SpeckleVoxelError[] = [];
    const warnings: string[] = [];

    try {
      // Fetch from Speckle API
      const speckleObjects = await this.fetchSpeckleObjects(streamId, commitId);

      if (speckleObjects.length === 0) {
        return {
          success: false,
          projectId,
          elementsProcessed: 0,
          elementsSkipped: 0,
          errors: [{ code: 'NO_SPECKLE_OBJECTS', message: 'No objects found in Speckle stream' }],
          warnings: [],
        };
      }

      // Transform to IFCElement format
      const { ifcElements, skipped, transformErrors } = this.transformSpeckleToIFCElements(speckleObjects);

      errors.push(...transformErrors);

      if (ifcElements.length === 0) {
        return {
          success: false,
          projectId,
          elementsProcessed: 0,
          elementsSkipped: skipped,
          errors: [...errors, { code: 'NO_VALID_ELEMENTS', message: 'No elements with valid geometry found' }],
          warnings,
        };
      }

      // Voxelize
      const voxelResult = await this.voxelService.voxelizeFromElements(
        projectId,
        `stream-${streamId}`,
        ifcElements
      );

      return {
        success: voxelResult.success,
        projectId,
        elementsProcessed: ifcElements.length,
        elementsSkipped: skipped,
        voxelizationResult: voxelResult,
        errors: [...errors, ...voxelResult.errors],
        warnings: [...warnings, ...voxelResult.warnings],
      };
    } catch (error) {
      return {
        success: false,
        projectId,
        elementsProcessed: 0,
        elementsSkipped: 0,
        errors: [{
          code: 'SPECKLE_VOXELIZATION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        }],
        warnings,
      };
    }
  }

  /**
   * Fetch project elements from database
   */
  private async fetchProjectElements(projectId: string): Promise<SpeckleElementRecord[]> {
    // Use raw query to access construction_elements table
    const result = await this.prisma.$queryRaw<SpeckleElementRecord[]>`
      SELECT
        id,
        project_id,
        ifc_id,
        element_type,
        element_name,
        properties,
        created_at,
        updated_at
      FROM construction_elements
      WHERE project_id = ${projectId}
    `;

    return result;
  }

  /**
   * Fetch objects from Speckle stream
   */
  private async fetchSpeckleObjects(
    streamId: string,
    commitId?: string
  ): Promise<SpeckleProperties[]> {
    // In production, this would call Speckle GraphQL API
    // For now, return empty array (implement with actual Speckle client)
    console.warn('[SpeckleVoxelIntegration] Speckle API fetch not implemented, use database method');
    return [];
  }

  /**
   * Transform database records to IFCElement format
   */
  private transformToIFCElements(records: SpeckleElementRecord[]): {
    ifcElements: IFCElement[];
    skipped: number;
    transformErrors: SpeckleVoxelError[];
  } {
    const ifcElements: IFCElement[] = [];
    const transformErrors: SpeckleVoxelError[] = [];
    let skipped = 0;
    let expressId = 1;

    for (const record of records) {
      try {
        const props = record.properties;
        const boundingBox = extractBoundingBox(props, this.options);

        if (!boundingBox) {
          skipped++;
          transformErrors.push({
            code: 'NO_BOUNDS',
            message: `Element ${record.id} has no bounding box data`,
            elementId: record.ifc_id,
          });
          continue;
        }

        // Determine IFC type
        let entityType: IFCEntityCategory;
        if (props.ifcType) {
          entityType = mapIFCType(props.ifcType);
        } else if (props.speckle_type) {
          entityType = mapSpeckleType(props.speckle_type);
        } else if (record.element_type) {
          entityType = mapIFCType(record.element_type);
        } else {
          entityType = IFCEntityCategory.UNKNOWN;
        }

        const ifcElement: IFCElement = {
          expressId: expressId++,
          globalId: record.ifc_id || record.id,
          type: entityType,
          name: record.element_name || props.name,
          description: props.Description,
          objectType: props.ObjectType,
          boundingBox,
          volume: props.volume || props.geometry?.volume,
          surfaceArea: props.area || props.geometry?.area,
          materials: extractMaterials(props),
          properties: props.psets || {},
          containedInStorey: extractLevel(props),
          containedInSpace: props.space || props.zone,
        };

        ifcElements.push(ifcElement);
      } catch (error) {
        skipped++;
        transformErrors.push({
          code: 'TRANSFORM_ERROR',
          message: `Failed to transform element ${record.id}: ${error}`,
          elementId: record.ifc_id,
        });
      }
    }

    return { ifcElements, skipped, transformErrors };
  }

  /**
   * Transform Speckle objects to IFCElement format
   */
  private transformSpeckleToIFCElements(objects: SpeckleProperties[]): {
    ifcElements: IFCElement[];
    skipped: number;
    transformErrors: SpeckleVoxelError[];
  } {
    const ifcElements: IFCElement[] = [];
    const transformErrors: SpeckleVoxelError[] = [];
    let skipped = 0;
    let expressId = 1;

    for (const obj of objects) {
      try {
        const boundingBox = extractBoundingBox(obj, this.options);

        if (!boundingBox) {
          skipped++;
          continue;
        }

        // Determine IFC type
        let entityType: IFCEntityCategory;
        if (obj.ifcType) {
          entityType = mapIFCType(obj.ifcType);
        } else if (obj.speckle_type) {
          entityType = mapSpeckleType(obj.speckle_type);
        } else {
          entityType = IFCEntityCategory.UNKNOWN;
        }

        const ifcElement: IFCElement = {
          expressId: expressId++,
          globalId: obj.GlobalId || `speckle-${expressId}`,
          type: entityType,
          name: obj.name,
          description: obj.Description,
          objectType: obj.ObjectType,
          boundingBox,
          volume: obj.volume || obj.geometry?.volume,
          surfaceArea: obj.area || obj.geometry?.area,
          materials: extractMaterials(obj),
          properties: obj.psets || {},
          containedInStorey: extractLevel(obj),
          containedInSpace: obj.space || obj.zone,
        };

        ifcElements.push(ifcElement);
      } catch (error) {
        skipped++;
        transformErrors.push({
          code: 'TRANSFORM_ERROR',
          message: `Failed to transform Speckle object: ${error}`,
        });
      }
    }

    return { ifcElements, skipped, transformErrors };
  }

  /**
   * Get voxel service for direct access
   */
  getVoxelService(): VoxelDecompositionService {
    return this.voxelService;
  }

  /**
   * Update options
   */
  setOptions(options: Partial<SpeckleVoxelOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

// ==============================================================================
// Factory Functions
// ==============================================================================

/**
 * Create Speckle-Voxel integration service
 */
export function createSpeckleVoxelIntegration(
  prisma: PrismaClient,
  options?: Partial<SpeckleVoxelOptions>
): SpeckleVoxelIntegrationService {
  return new SpeckleVoxelIntegrationService(prisma, options);
}

export default SpeckleVoxelIntegrationService;
