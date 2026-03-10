/**
 * Speckle Sync Service
 * Handles bidirectional synchronization between IFC files, Speckle, and database
 *
 * ENTERPRISE FIX (2025-11-23): Integrated IFC parsing for proper 3D geometry rendering
 * Root cause: Raw IFC files uploaded as base64 documents don't render in Speckle viewer
 * Solution: Parse IFC files to extract elements, convert to Speckle BuiltElements types
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Pool } from 'pg';
import type {
  SpeckleConfig,
  SpeckleObject,
  SpeckleSyncResult,
} from '../interfaces/speckle.types.js';

// Enterprise-grade interface for construction elements
interface ConstructionElement {
  id: string;
  element_type: string;
  properties: Record<string, unknown>;
  geometry_data: Record<string, unknown>;
}

// Interface for IFC processor integration
interface IFCProcessor {
  parseIFCFile?(filePath: string): {
    name: string;
    elements: Array<{
      id: string;
      type: string;
      name?: string;
      description?: string;
      properties: Record<string, any>;
      geometry?: {
        type: string;
        coordinates?: number[][];
        volume?: number;
        area?: number;
      };
      materials?: string[];
      relationships?: {
        containedIn?: string;
        contains?: string[];
        connectedTo?: string[];
      };
    }>;
    metadata: {
      ifcVersion: string;
      originalFile: string;
      processedAt: string;
      elementCount: number;
    };
  };
}

export class SpeckleSyncService extends EventEmitter {
  private db: Pool;
  private config: SpeckleConfig;
  private ifcProcessor?: IFCProcessor;

  constructor(db: Pool, config: SpeckleConfig) {
    super();
    this.db = db;
    this.config = config;
  }

  /**
   * Set IFC processor for proper geometry parsing
   * ENTERPRISE INTEGRATION: Enables parsed IFC uploads instead of raw base64
   */
  setIFCProcessor(processor: IFCProcessor): void {
    this.ifcProcessor = processor;
    console.info('[SpeckleSyncService] IFC processor attached - parsed geometry uploads enabled');
  }

  /**
   * Import IFC file to Speckle stream
   */
  async importIFCToSpeckle(
    constructionProjectId: string,
    ifcFilePath: string,
    streamId: string
  ): Promise<SpeckleSyncResult> {
    console.info('[SpeckleSyncService] === IFC IMPORT START ===');
    console.info(`[SpeckleSyncService] Project: ${constructionProjectId}, Stream: ${streamId}`);
    console.info(`[SpeckleSyncService] IFC file: ${ifcFilePath}`);
    console.info(`[SpeckleSyncService] IFC processor attached: ${!!this.ifcProcessor?.parseIFCFile}`);

    const result: SpeckleSyncResult = {
      success: false,
      objectsProcessed: 0,
      objectsSuccessful: 0,
      objectsFailed: 0,
      errors: [],
    };
    try {
      // Log sync start
      const syncId = await this.createSyncLog(
        constructionProjectId,
        'import',
        'started'
      );
      // Upload IFC file to Speckle
      console.info('[SpeckleSyncService] Calling uploadIFCToSpeckle...');
      const commitId = await this.uploadIFCToSpeckle(ifcFilePath, streamId);
      console.info(`[SpeckleSyncService] Upload complete - objectId: ${commitId}`);
      // Fetch the created objects
      const speckleObjects = await this.fetchSpeckleObjects(streamId, commitId);
      result.objectsProcessed = speckleObjects.length;
      // Sync objects to database
      const syncResults = await this.syncSpeckleObjectsToDatabase(
        speckleObjects,
        constructionProjectId
      );
      result.objectsSuccessful = syncResults.successful;
      result.objectsFailed = syncResults.failed;
      result.errors = syncResults.errors;
      result.success = result.objectsFailed === 0;
      // Complete sync log
      await this.completeSyncLog(
        syncId,
        result.success ? 'completed' : 'failed'
      );
      this.emit('importCompleted', { constructionProjectId, result });
      return result;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : String(error)
      );
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Export elements from database to Speckle
   */
  async exportElementsToSpeckle(
    constructionProjectId: string,
    streamId: string,
    elementIds?: string[]
  ): Promise<SpeckleSyncResult> {
    const result: SpeckleSyncResult = {
      success: false,
      objectsProcessed: 0,
      objectsSuccessful: 0,
      objectsFailed: 0,
      errors: [],
    };
    try {
      // Get construction elements from database
      const elements = await this.getConstructionElements(
        constructionProjectId,
        elementIds
      );
      result.objectsProcessed = elements.length;
      if (elements.length === 0) {
        result.success = true;
        return result;
      }
      // Convert to Speckle objects
      const speckleObjects = this.convertElementsToSpeckleObjects(elements);
      // Create commit with objects
      const commitId = await this.createCommitWithObjects(
        streamId,
        'Export from Ectropy',
        speckleObjects
      );
      result.objectsSuccessful = speckleObjects.length;
      result.success = true;
      this.emit('exportCompleted', { constructionProjectId, commitId, result });
      return result;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : String(error)
      );
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Sync Speckle objects to database
   * ENTERPRISE FIX: Aligned with Prisma schema column names
   * - project_id (not construction_project_id)
   * - ifc_id (not speckle_object_id)
   * - element_name (required field)
   * - geometry stored in properties JSON (no separate geometry_data column)
   */
  private async syncSpeckleObjectsToDatabase(
    objects: SpeckleObject[],
    constructionProjectId: string
  ): Promise<{ successful: number; failed: number; errors: string[] }> {
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const obj of objects) {
      try {
        // Combine properties and geometry into single JSON for properties column
        const combinedProperties = {
          ...obj.properties,
          geometry: obj.geometry,
          speckle_type: obj.speckle_type,
        };

        // Extract element name from properties or use type as fallback
        const elementName = (obj.properties as any)?.fileName ||
                           (obj.properties as any)?.name ||
                           obj.speckle_type ||
                           'Imported Element';

        // ENTERPRISE FIX: Explicitly generate UUID for id column
        // Raw SQL queries bypass Prisma's @default(uuid()) - use PostgreSQL gen_random_uuid()
        await this.db.query(
          `
              INSERT INTO construction_elements (
                id,
                project_id,
                ifc_id,
                element_type,
                element_name,
                properties,
                created_at,
                updated_at
              ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
            `,
          [
            constructionProjectId,
            obj.id,
            obj.speckle_type || 'Unknown',
            elementName,
            JSON.stringify(combinedProperties),
          ]
        );
        successful++;
      } catch (error) {
        failed++;
        errors.push(
          `Failed to sync object ${obj.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    return { successful, failed, errors };
  }

  /**
   * Fetch Speckle objects from a commit
   * ENTERPRISE FIX: Speckle v2 API uses camelCase field names (speckleType not speckle_type)
   */
  private async fetchSpeckleObjects(
    streamId: string,
    commitId: string
  ): Promise<SpeckleObject[]> {
    const query = `
          query GetCommitObjects($streamId: String!, $objectId: String!) {
            stream(id: $streamId) {
              object(id: $objectId) {
                id
                speckleType
                data
              }
            }
          }
        `;
    const response = await this.executeGraphQL(query, {
      streamId,
      objectId: commitId,
    });
    return this.flattenSpeckleObjects([response.data.stream.object]);
  }

  /**
   * Flatten nested Speckle objects
   * ENTERPRISE FIX: Handle both speckleType (v2 API camelCase) and speckle_type (legacy)
   */
  private flattenSpeckleObjects(objects: any[]): SpeckleObject[] {
    const flattened: SpeckleObject[] = [];
    const traverse = (obj: any) => {
      // Support both camelCase (v2 API) and snake_case (legacy)
      const speckleType = obj.speckleType || obj.speckle_type;
      if (obj.id && speckleType) {
        flattened.push({
          id: obj.id,
          speckle_type: speckleType,
          properties: obj.data || {},
          geometry: obj.geometry,
          children: obj.children,
        });
      }
      if (obj.children) {
        obj.children.forEach(traverse);
      }
    };
    objects.forEach(traverse);
    return flattened;
  }

  /**
   * Upload IFC file to Speckle and create commit
   * ENTERPRISE FIX (2025-11-23): Parse IFC to extract geometry for proper 3D rendering
   *
   * Architecture Flow:
   * 1. If IFC processor attached: Parse IFC → Extract elements → Convert to BuiltElements
   * 2. If no processor (fallback): Upload raw IFC as Document (won't render in 3D)
   *
   * The viewer requires Objects.BuiltElements.* types with geometry data, not raw documents.
   */
  private async uploadIFCToSpeckle(
    ifcFilePath: string,
    streamId: string
  ): Promise<string> {
    let speckleObjects: SpeckleObject[];

    // ENTERPRISE CORE RESOLVE: Use IFC parser for proper geometry extraction
    if (this.ifcProcessor?.parseIFCFile) {
      console.info('[SpeckleSyncService] IFC processor detected - parsing file for 3D geometry...');
      try {
        console.info(`[SpeckleSyncService] Calling parseIFCFile(${ifcFilePath})...`);
        const parsedIFC = this.ifcProcessor.parseIFCFile(ifcFilePath);
        console.info(`[SpeckleSyncService] SUCCESS: Parsed ${parsedIFC.elements.length} IFC elements`);
        console.info(`[SpeckleSyncService] IFC Version: ${parsedIFC.metadata.ifcVersion}`);

        // Convert parsed IFC elements to Speckle BuiltElements objects
        speckleObjects = this.convertIFCElementsToSpeckleObjects(parsedIFC);
        console.info(`[SpeckleSyncService] Converted to ${speckleObjects.length} Speckle objects`);

        // ENTERPRISE FIX (2025-11-23): Build __closure dictionary for ObjectLoader
        // The @speckle/objectloader requires __closure to know which children to download
        // Without this, traverseAndConstruct times out waiting for objects that were never fetched
        // Format: { childId: minDepth } where minDepth is the minimum depth from root
        const closure: Record<string, number> = {};
        speckleObjects.forEach(obj => {
          const childId = this.generateSpeckleObjectId(obj);
          closure[childId] = 1; // Direct children have depth 1
        });

        // Add root object that contains all children
        const rootObject: SpeckleObject = {
          id: `ifc-root-${Date.now()}`,
          speckle_type: 'Base',
          properties: {
            name: parsedIFC.name,
            totalChildrenCount: speckleObjects.length,
            ifcVersion: parsedIFC.metadata.ifcVersion,
            originalFile: parsedIFC.metadata.originalFile,
            processedAt: parsedIFC.metadata.processedAt,
            '@elements': speckleObjects.map(obj => ({ referencedId: this.generateSpeckleObjectId(obj) })),
            // CRITICAL: __closure tells ObjectLoader which children to download
            __closure: closure,
          },
          children: speckleObjects,
        };

        // Upload root + all child elements
        speckleObjects = [rootObject, ...speckleObjects];
      } catch (parseError) {
        console.error('[SpeckleSyncService] IFC parsing failed, falling back to raw upload:', parseError);
        // Fall through to raw upload
        speckleObjects = await this.createRawIFCObject(ifcFilePath);
      }
    } else {
      console.warn('[SpeckleSyncService] No IFC processor attached - uploading raw file (will not render in 3D viewer)');
      speckleObjects = await this.createRawIFCObject(ifcFilePath);
    }

    // Create objects in Speckle
    const objectId = await this.createSpeckleObject(streamId, speckleObjects);

    // Create commit
    const mutation = `
          mutation CreateCommit($input: CommitCreateInput!) {
            commitCreate(commit: $input)
          }
        `;
    const variables = {
      input: {
        message: `IFC import: ${path.basename(ifcFilePath)}`,
        objectId,
        streamId,
        branchName: 'main', // Required by Speckle v2 API
      },
    };
    await this.executeGraphQL(mutation, variables);
    // Return objectId (not commitId) so we can query the uploaded object
    return objectId;
  }

  /**
   * Create raw IFC document object (fallback when parser unavailable)
   */
  private async createRawIFCObject(ifcFilePath: string): Promise<SpeckleObject[]> {
    const fileData = await fs.promises.readFile(ifcFilePath);
    return [
      {
        id: 'ifc-file',
        speckle_type: 'Objects.Other.Document',
        properties: {
          fileName: path.basename(ifcFilePath),
          buffer: fileData.toString('base64'),
          warning: 'Raw IFC document - use IFC processor for 3D geometry rendering',
        },
      },
    ];
  }

  /**
   * Convert parsed IFC elements to Speckle BuiltElements objects
   * ENTERPRISE CORE: This is the key transformation for 3D viewer rendering
   *
   * SPECKLE FORMAT REQUIREMENTS (2025-11-23):
   * - displayValue must be a DIRECT property on the object (not nested under geometry)
   * - displayValue contains mesh objects with vertices/faces for viewer rendering
   * - Faces array format: [vertexCount, idx1, idx2, idx3, ...] where vertexCount=3 for triangles
   */
  private convertIFCElementsToSpeckleObjects(parsedIFC: ReturnType<NonNullable<IFCProcessor['parseIFCFile']>>): SpeckleObject[] {
    return parsedIFC.elements.map((element) => {
      // Map IFC type to Speckle BuiltElements type
      const speckleType = this.mapIFCTypeToSpeckleType(element.type);

      // Create display mesh for Speckle viewer
      // CRITICAL: displayValue must be a direct property, not nested under geometry
      const displayMesh = this.createDisplayMesh(element);

      return {
        id: element.id,
        speckle_type: speckleType,
        // SPECKLE VIEWER REQUIREMENT: displayValue at root level for rendering
        displayValue: displayMesh ? [displayMesh] : undefined,
        properties: {
          name: element.name || `${element.type} Element`,
          description: element.description,
          ifcType: element.type,
          ...element.properties,
          materials: element.materials,
          relationships: element.relationships,
          // Keep geometry metadata for reference
          geometry: element.geometry ? {
            type: element.geometry.type,
            volume: element.geometry.volume,
            area: element.geometry.area,
          } : undefined,
        },
      };
    });
  }

  /**
   * Map IFC types to Speckle BuiltElements types
   * These types are recognized by Speckle viewer for proper rendering
   */
  private mapIFCTypeToSpeckleType(ifcType: string): string {
    const typeMap: Record<string, string> = {
      // Structural elements
      IFCWALL: 'Objects.BuiltElements.Wall',
      IFCWALLSTANDARDCASE: 'Objects.BuiltElements.Wall',
      IFCSLAB: 'Objects.BuiltElements.Floor',
      IFCBEAM: 'Objects.BuiltElements.Beam',
      IFCCOLUMN: 'Objects.BuiltElements.Column',
      IFCFOOTING: 'Objects.BuiltElements.Column', // Closest match
      // Openings
      IFCDOOR: 'Objects.BuiltElements.Door',
      IFCWINDOW: 'Objects.BuiltElements.Window',
      IFCOPENING: 'Objects.BuiltElements.Opening',
      // Vertical circulation
      IFCSTAIR: 'Objects.BuiltElements.Stair',
      IFCRAMP: 'Objects.BuiltElements.Stair', // Closest match
      // Roof
      IFCROOF: 'Objects.BuiltElements.Roof',
      IFCCOVERING: 'Objects.BuiltElements.Roof',
      // Spaces
      IFCSPACE: 'Objects.BuiltElements.Room',
      IFCZONE: 'Objects.BuiltElements.Room',
      // MEP
      IFCPIPESEGMENT: 'Objects.BuiltElements.Duct',
      IFCDUCTSEGMENT: 'Objects.BuiltElements.Duct',
      // Furniture and equipment
      IFCFURNISHINGELEMENT: 'Objects.Other.Furniture',
      IFCBUILDINGELEMENTPROXY: 'Objects.Other.GenericModel',
    };

    // Normalize type name (remove IFC prefix, uppercase)
    const normalizedType = ifcType.toUpperCase().replace(/^IFC/, 'IFC');
    return typeMap[normalizedType] || 'Objects.Other.GenericModel';
  }

  /**
   * Create display mesh for Speckle viewer
   * Uses simplified box representation based on element geometry
   *
   * SPECKLE MESH FORMAT (per Speckle/Objects/Geometry/Mesh.cs):
   * - vertices: flat array [x1, y1, z1, x2, y2, z2, ...]
   * - faces: [vertexCount, idx1, idx2, ..., vertexCount, idx1, idx2, ...]
   *   where vertexCount=3 for triangle, vertexCount=4 for quad
   */
  private createDisplayMesh(element: {
    geometry?: { volume?: number; area?: number; type?: string };
    type: string;
  }): object | undefined {
    if (!element.geometry) return undefined;

    // Create simplified mesh representation
    // In production, this would generate actual vertices from IFC geometry
    const volume = element.geometry.volume || 1;
    const area = element.geometry.area || 1;

    // Estimate dimensions from volume and area
    const height = Math.max(area > 0 ? volume / area : 1, 0.1);
    const side = Math.max(Math.sqrt(area), 0.1);

    // Use element ID hash to offset position (avoid all boxes at origin)
    const hash = element.type.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
    const offsetX = (hash % 100) * 0.5;
    const offsetY = ((hash >> 8) % 100) * 0.5;

    return {
      speckle_type: 'Objects.Geometry.Mesh',
      units: 'meters',
      // 8 vertices for a box (corners)
      vertices: [
        offsetX, offsetY, 0,                    // 0: origin
        offsetX + side, offsetY, 0,             // 1: +x
        offsetX + side, offsetY + side, 0,      // 2: +x +y
        offsetX, offsetY + side, 0,             // 3: +y
        offsetX, offsetY, height,               // 4: +z
        offsetX + side, offsetY, height,        // 5: +x +z
        offsetX + side, offsetY + side, height, // 6: +x +y +z
        offsetX, offsetY + side, height,        // 7: +y +z
      ],
      // CORRECT Speckle face format: [vertexCount, idx1, idx2, idx3, ...]
      // 12 triangles (2 per face, 6 faces for a box)
      faces: [
        // Bottom face (z=0)
        3, 0, 2, 1,
        3, 0, 3, 2,
        // Top face (z=height)
        3, 4, 5, 6,
        3, 4, 6, 7,
        // Front face (y=0)
        3, 0, 1, 5,
        3, 0, 5, 4,
        // Back face (y=side)
        3, 3, 6, 2,
        3, 3, 7, 6,
        // Left face (x=0)
        3, 0, 4, 7,
        3, 0, 7, 3,
        // Right face (x=side)
        3, 1, 2, 6,
        3, 1, 6, 5,
      ],
      renderMaterial: this.getMaterialForType(element.type),
    };
  }

  /**
   * Get render material based on element type
   */
  private getMaterialForType(elementType: string): object {
    const materials: Record<string, { diffuse: number; opacity: number }> = {
      WALL: { diffuse: 0xCCCCCC, opacity: 1.0 },      // Light gray
      SLAB: { diffuse: 0x999999, opacity: 1.0 },      // Medium gray
      BEAM: { diffuse: 0xCC6600, opacity: 1.0 },      // Orange (steel)
      COLUMN: { diffuse: 0x888888, opacity: 1.0 },    // Dark gray
      DOOR: { diffuse: 0x8B4513, opacity: 0.9 },      // Brown (wood)
      WINDOW: { diffuse: 0x87CEEB, opacity: 0.3 },    // Light blue (glass)
      ROOF: { diffuse: 0xB22222, opacity: 1.0 },      // Dark red
      SPACE: { diffuse: 0xFFFFFF, opacity: 0.2 },     // Transparent white
    };

    const normalizedType = elementType.toUpperCase().replace(/^IFC/, '');
    const material = Object.entries(materials).find(([key]) =>
      normalizedType.includes(key)
    );

    return {
      '@type': 'Objects.Other.RenderMaterial',
      diffuse: material?.[1].diffuse || 0xAAAAAA,
      opacity: material?.[1].opacity || 1.0,
    };
  }

  /**
   * Get construction elements from database
   * ENTERPRISE FIX: Aligned with Prisma schema column names
   * - project_id (not construction_project_id)
   * - properties JSON contains geometry (no separate geometry_data column)
   */
  private async getConstructionElements(
    constructionProjectId: string,
    elementIds?: string[]
  ): Promise<ConstructionElement[]> {
    let query = `
          SELECT id, element_type, properties, properties->'geometry' as geometry_data
          FROM construction_elements
          WHERE project_id = $1`;
    const params: unknown[] = [constructionProjectId];
    if (elementIds && elementIds.length > 0) {
      query += ` AND id = ANY($2)`;
      params.push(elementIds);
    }
    const result = await this.db.query(query, params);
    return result.rows as ConstructionElement[];
  }

  /**
   * Convert database elements to Speckle objects
   */
  private convertElementsToSpeckleObjects(
    elements: ConstructionElement[]
  ): SpeckleObject[] {
    return elements.map((element) => ({
      id: element.id,
      speckle_type: this.mapElementTypeToSpeckle(element.element_type),
      properties: element.properties,
      geometry: element.geometry_data,
    }));
  }

  /**
   * Map internal element types to Speckle types
   */
  private mapElementTypeToSpeckle(elementType: string): string {
    const typeMap: Record<string, string> = {
      wall: 'Objects.BuiltElements.Wall',
      beam: 'Objects.BuiltElements.Beam',
      column: 'Objects.BuiltElements.Column',
      slab: 'Objects.BuiltElements.Floor',
      door: 'Objects.BuiltElements.Door',
      window: 'Objects.BuiltElements.Window',
    };
    return typeMap[elementType.toLowerCase()] || 'Objects.Other.Unknown';
  }

  /**
   * Create commit with Speckle objects
   */
  private async createCommitWithObjects(
    streamId: string,
    message: string,
    objects: SpeckleObject[]
  ): Promise<string> {
    // Create object in Speckle
    const objectId = await this.createSpeckleObject(streamId, objects);
    // Create commit
    const mutation = `
          mutation CreateCommit($input: CommitCreateInput!) {
            commitCreate(commit: $input)
          }
        `;
    const variables = {
      input: {
        message,
        objectId,
        streamId,
        branchName: 'main', // Required by Speckle v2 API
      },
    };
    const response = await this.executeGraphQL(mutation, variables);
    return response.data.commitCreate;
  }

  /**
   * Create Speckle object from data
   * Speckle v2 API requires multipart/form-data with JSON array
   * Reference: https://speckle.guide/dev/server-api.html
   */
  private async createSpeckleObject(
    streamId: string,
    objects: SpeckleObject[]
  ): Promise<string> {
    console.info(`[SpeckleSyncService] Creating Speckle object - ${objects.length} objects to stream ${streamId}`);

    // Generate deterministic object IDs using Speckle hashing convention
    const speckleFormattedObjects = objects.map((obj, index) => {
      // Create a Speckle-compatible object with required fields
      // ENTERPRISE FIX (2025-11-23): Include displayValue for viewer rendering
      const speckleObj: Record<string, unknown> = {
        id: this.generateSpeckleObjectId(obj),
        speckle_type: obj.speckle_type || 'Base',
        totalChildrenCount: obj.children?.length || 0,
        ...obj.properties,
      };

      // CRITICAL: displayValue must be at root level for Speckle viewer to render
      if ((obj as any).displayValue) {
        speckleObj['@displayValue'] = (obj as any).displayValue;
      }

      // Include geometry if present
      if (obj.geometry) {
        speckleObj['@geometry'] = obj.geometry;
      }

      // Include children references
      if (obj.children && obj.children.length > 0) {
        speckleObj['@elements'] = obj.children.map(child => ({
          referencedId: this.generateSpeckleObjectId(child),
        }));
      }

      return speckleObj;
    });

    // Speckle v2 API expects JSON array wrapped in multipart/form-data
    const jsonArrayBody = JSON.stringify(speckleFormattedObjects);

    // Create multipart form data with the batch file
    const boundary = `----SpeckleBatch${Date.now()}`;
    const formBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="batch1"; filename="batch1.json"',
      'Content-Type: application/json',
      '',
      jsonArrayBody,
      `--${boundary}--`,
    ].join('\r\n');

    const response = await fetch(
      `${this.config.serverUrl}/objects/${streamId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${this.config.token}`,
        },
        body: formBody,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SpeckleSyncService] Speckle object creation failed: ${response.status} ${response.statusText}`);
      console.error(`[SpeckleSyncService] Error response: ${errorText}`);
      throw new Error(
        `Failed to create Speckle object: ${response.statusText} - ${errorText}`
      );
    }

    // Return the ID of the first object (root object)
    const rootObjectId = String(speckleFormattedObjects[0]?.id || 'unknown');
    console.info(`[SpeckleSyncService] Speckle object created successfully - rootObjectId: ${rootObjectId}`);
    return rootObjectId;
  }

  /**
   * Generate a Speckle-compatible object ID
   * Uses SHA256 hash of object content for deterministic IDs
   */
  private generateSpeckleObjectId(obj: SpeckleObject): string {
    const content = JSON.stringify({
      speckle_type: obj.speckle_type,
      properties: obj.properties,
      geometry: obj.geometry,
    });
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 32);
  }

  /**
   * Create sync log entry
   */
  private async createSyncLog(
    constructionProjectId: string,
    operation: string,
    status: string
  ): Promise<string> {
    const result = await this.db.query(
      `
          INSERT INTO speckle_sync_logs (
            construction_project_id,
            operation,
            status,
            started_at
          ) VALUES ($1, $2, $3, NOW())
          RETURNING id
        `,
      [constructionProjectId, operation, status]
    );
    return result.rows[0].id;
  }

  /**
   * Complete sync log entry
   */
  private async completeSyncLog(syncId: string, status: string): Promise<void> {
    await this.db.query(
      `
          UPDATE speckle_sync_logs
          SET status = $1, completed_at = NOW()
          WHERE id = $2
        `,
      [status, syncId]
    );
  }

  /**
   * Execute GraphQL query/mutation against Speckle server
   */
  private async executeGraphQL(
    query: string,
    variables: any = {}
  ): Promise<any> {
    const response = await fetch(`${this.config.serverUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`);
    }
    const result = (await response.json()) as {
      data?: any;
      errors?: unknown[];
    };
    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }
    return result;
  }
}
