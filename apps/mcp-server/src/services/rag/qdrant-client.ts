/**
 * Qdrant Vector Database Client
 *
 * Wrapper around Qdrant client with multi-tenant collection management.
 *
 * @module services/rag/qdrant-client
 * @version 1.0.0
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';
import {
  RagCollectionName,
  RAG_COLLECTION_LIST,
  EMBEDDING_CONFIG,
  CollectionConfig,
  CollectionInfo,
  RagChunk,
  ChunkMetadata,
  RagError,
  getTenantCollectionName,
  buildRagChunkUrn,
} from './types.js';

// ==============================================================================
// Configuration
// ==============================================================================

interface QdrantConfig {
  host: string;
  port: number;
  apiKey?: string;
  https?: boolean;
}

function getQdrantConfig(): QdrantConfig {
  return {
    host: process.env.QDRANT_HOST || 'localhost',
    port: parseInt(process.env.QDRANT_PORT || '6333', 10),
    apiKey: process.env.QDRANT_API_KEY,
    https: process.env.QDRANT_HTTPS === 'true',
  };
}

// ==============================================================================
// Qdrant Client Singleton
// ==============================================================================

let qdrantClient: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    const config = getQdrantConfig();
    qdrantClient = new QdrantClient({
      host: config.host,
      port: config.port,
      apiKey: config.apiKey,
      https: config.https,
    });
  }
  return qdrantClient;
}

// ==============================================================================
// Collection Management
// ==============================================================================

/**
 * Create a collection for a tenant
 */
export async function createCollection(
  config: CollectionConfig
): Promise<void> {
  const client = getQdrantClient();
  const collectionName = getTenantCollectionName(config.name, config.tenantId);

  try {
    // Check if collection exists
    const collections = await client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === collectionName
    );

    if (exists) {
      console.log(`Collection ${collectionName} already exists`);
      return;
    }

    // Create collection with HNSW index
    await client.createCollection(collectionName, {
      vectors: {
        size: config.dimensions,
        distance: config.distanceMetric,
      },
      hnsw_config: {
        m: 16,
        ef_construct: 100,
        full_scan_threshold: 10000,
      },
      optimizers_config: {
        indexing_threshold: 20000,
      },
    });

    // Create payload indexes for filtering
    await client.createPayloadIndex(collectionName, {
      field_name: 'project_id',
      field_schema: 'keyword',
    });
    await client.createPayloadIndex(collectionName, {
      field_name: 'tenant_id',
      field_schema: 'keyword',
    });
    await client.createPayloadIndex(collectionName, {
      field_name: 'document_type',
      field_schema: 'keyword',
    });
    await client.createPayloadIndex(collectionName, {
      field_name: 'created_at',
      field_schema: 'datetime',
    });

    console.log(`Created collection ${collectionName}`);
  } catch (error: any) {
    throw new RagError(
      `Failed to create collection ${collectionName}: ${error.message}`,
      'INVALID_CONFIG',
      { collectionName, error: error.message }
    );
  }
}

/**
 * Provision all standard collections for a tenant
 */
export async function provisionTenantCollections(
  tenantId: string
): Promise<void> {
  console.log(`Provisioning collections for tenant ${tenantId}`);

  for (const collectionName of RAG_COLLECTION_LIST) {
    await createCollection({
      name: collectionName,
      tenantId,
      dimensions: EMBEDDING_CONFIG.DIMENSIONS,
      indexType: 'HNSW',
      distanceMetric: 'Cosine',
    });
  }

  console.log(
    `Provisioned ${RAG_COLLECTION_LIST.length} collections for tenant ${tenantId}`
  );
}

/**
 * Get collection info
 */
export async function getCollectionInfo(
  collectionName: RagCollectionName,
  tenantId: string
): Promise<CollectionInfo | null> {
  const client = getQdrantClient();
  const fullName = getTenantCollectionName(collectionName, tenantId);

  try {
    const info = await client.getCollection(fullName);
    // Extract dimensions from vector config - may be a number or config object
    const vectorConfig = info.config.params.vectors;
    const dimensions =
      typeof vectorConfig === 'number'
        ? vectorConfig
        : (vectorConfig as { size?: number } | undefined)?.size ||
          EMBEDDING_CONFIG.DIMENSIONS;
    return {
      name: fullName,
      vectorCount: info.points_count || 0,
      dimensions,
      indexType: 'HNSW',
      status: info.status === 'green' ? 'ready' : 'indexing',
    };
  } catch (error: any) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Delete collection
 */
export async function deleteCollection(
  collectionName: RagCollectionName,
  tenantId: string
): Promise<void> {
  const client = getQdrantClient();
  const fullName = getTenantCollectionName(collectionName, tenantId);

  try {
    await client.deleteCollection(fullName);
    console.log(`Deleted collection ${fullName}`);
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }
}

// ==============================================================================
// Vector Operations
// ==============================================================================

/**
 * Upsert vectors into collection
 */
export async function upsertVectors(
  collectionName: RagCollectionName,
  tenantId: string,
  vectors: Array<{
    id: string;
    vector: number[];
    payload: Partial<ChunkMetadata> & Record<string, unknown>;
  }>
): Promise<string[]> {
  const client = getQdrantClient();
  const fullName = getTenantCollectionName(collectionName, tenantId);

  try {
    const points = vectors.map((v) => ({
      id: v.id,
      vector: v.vector,
      payload: {
        ...v.payload,
        project_id: v.payload.projectId,
        tenant_id: v.payload.tenantId,
        document_type: v.payload.documentType,
        created_at:
          v.payload.createdAt instanceof Date
            ? v.payload.createdAt.toISOString()
            : v.payload.createdAt || new Date().toISOString(),
        updated_at:
          v.payload.updatedAt instanceof Date
            ? v.payload.updatedAt.toISOString()
            : v.payload.updatedAt || new Date().toISOString(),
      },
    }));

    await client.upsert(fullName, {
      wait: true,
      points,
    });

    return vectors.map((v) => v.id);
  } catch (error: any) {
    throw new RagError(
      `Failed to upsert vectors: ${error.message}`,
      'INDEX_FAILED',
      { collectionName: fullName, vectorCount: vectors.length }
    );
  }
}

/**
 * Search vectors by similarity
 */
export async function searchVectors(
  collectionName: RagCollectionName,
  tenantId: string,
  queryVector: number[],
  options: {
    limit?: number;
    projectId?: string;
    filters?: Record<string, unknown>;
    scoreThreshold?: number;
  } = {}
): Promise<
  Array<{ id: string; score: number; payload: Record<string, unknown> }>
> {
  const client = getQdrantClient();
  const fullName = getTenantCollectionName(collectionName, tenantId);

  const { limit = 10, projectId, filters = {}, scoreThreshold = 0.0 } = options;

  // Build filter conditions
  const must: any[] = [{ key: 'tenant_id', match: { value: tenantId } }];

  if (projectId) {
    must.push({ key: 'project_id', match: { value: projectId } });
  }

  if (filters.documentType) {
    must.push({ key: 'document_type', match: { value: filters.documentType } });
  }

  if (filters.dateFrom || filters.dateTo) {
    const dateFilter: any = { key: 'created_at' };
    if (filters.dateFrom) {
      dateFilter.gte = (filters.dateFrom as Date).toISOString();
    }
    if (filters.dateTo) {
      dateFilter.lte = (filters.dateTo as Date).toISOString();
    }
    must.push({ range: dateFilter });
  }

  try {
    const results = await client.search(fullName, {
      vector: queryVector,
      limit,
      filter: must.length > 0 ? { must } : undefined,
      score_threshold: scoreThreshold,
      with_payload: true,
    });

    return results.map((r) => ({
      id: r.id as string,
      score: r.score,
      payload: r.payload as Record<string, unknown>,
    }));
  } catch (error: any) {
    throw new RagError(
      `Failed to search vectors: ${error.message}`,
      'SEARCH_FAILED',
      { collectionName: fullName }
    );
  }
}

/**
 * Delete vectors by IDs
 */
export async function deleteVectors(
  collectionName: RagCollectionName,
  tenantId: string,
  vectorIds: string[]
): Promise<void> {
  const client = getQdrantClient();
  const fullName = getTenantCollectionName(collectionName, tenantId);

  try {
    await client.delete(fullName, {
      wait: true,
      points: vectorIds,
    });
  } catch (error: any) {
    throw new RagError(
      `Failed to delete vectors: ${error.message}`,
      'INDEX_FAILED',
      { collectionName: fullName, vectorIds }
    );
  }
}

/**
 * Get vectors by IDs
 */
export async function getVectors(
  collectionName: RagCollectionName,
  tenantId: string,
  vectorIds: string[]
): Promise<Array<{ id: string; payload: Record<string, unknown> }>> {
  const client = getQdrantClient();
  const fullName = getTenantCollectionName(collectionName, tenantId);

  try {
    const results = await client.retrieve(fullName, {
      ids: vectorIds,
      with_payload: true,
    });

    return results.map((r) => ({
      id: r.id as string,
      payload: r.payload as Record<string, unknown>,
    }));
  } catch (error: any) {
    throw new RagError(
      `Failed to get vectors: ${error.message}`,
      'SEARCH_FAILED',
      { collectionName: fullName, vectorIds }
    );
  }
}

/**
 * Health check for Qdrant connection
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  collections: number;
  message: string;
}> {
  try {
    const client = getQdrantClient();
    const collections = await client.getCollections();
    return {
      healthy: true,
      collections: collections.collections.length,
      message: 'Qdrant connection healthy',
    };
  } catch (error: any) {
    return {
      healthy: false,
      collections: 0,
      message: `Qdrant connection failed: ${error.message}`,
    };
  }
}

// ==============================================================================
// Alias Exports (for backward compatibility with hybrid-search.ts and rag.service.ts)
// ==============================================================================

/** Alias for searchVectors */
export const vectorSearch = searchVectors;

/** Alias for upsertVectors */
export const upsertPoints = upsertVectors;

/** Alias for deleteVectors */
export const deletePointsByFilter = deleteVectors;

/** Semantic alias: buildCollectionName(tenantId, baseName) → '{tenantId}_{baseName}' */
export function buildCollectionName(
  tenantId: string,
  baseName: RagCollectionName
): string {
  return getTenantCollectionName(baseName, tenantId);
}

/**
 * Check if Qdrant is available
 */
export async function isQdrantAvailable(): Promise<boolean> {
  const result = await healthCheck();
  return result.healthy;
}

/**
 * Delete all collections for a tenant
 */
export async function deleteTenantCollections(tenantId: string): Promise<void> {
  for (const collectionName of RAG_COLLECTION_LIST) {
    await deleteCollection(collectionName, tenantId);
  }
}

/**
 * Search across multiple collections
 * Returns a Map of collection name to results (matches hybrid-search.ts expectations)
 */
export async function multiCollectionSearch(
  tenantId: string,
  collections: RagCollectionName[],
  queryVector: number[],
  limit: number = 10,
  filter?: Record<string, unknown>
): Promise<
  Map<
    RagCollectionName,
    Array<{ id: string; score: number; payload: Record<string, unknown> }>
  >
> {
  const resultsMap = new Map<
    RagCollectionName,
    Array<{ id: string; score: number; payload: Record<string, unknown> }>
  >();

  for (const collection of collections) {
    try {
      const results = await searchVectors(collection, tenantId, queryVector, {
        limit,
        filters: filter,
      });
      resultsMap.set(collection, results);
    } catch (error) {
      // Log but continue with other collections
      console.warn(`Search failed for collection ${collection}:`, error);
      resultsMap.set(collection, []);
    }
  }

  return resultsMap;
}

/**
 * Get stats for a tenant's collections
 */
export async function getTenantStats(tenantId: string): Promise<{
  totalVectors: number;
  collectionStats: Array<{
    name: RagCollectionName;
    vectorCount: number;
    status: string;
  }>;
}> {
  const stats: Array<{
    name: RagCollectionName;
    vectorCount: number;
    status: string;
  }> = [];
  let totalVectors = 0;

  for (const collectionName of RAG_COLLECTION_LIST) {
    const info = await getCollectionInfo(collectionName, tenantId);
    if (info) {
      stats.push({
        name: collectionName,
        vectorCount: info.vectorCount,
        status: info.status,
      });
      totalVectors += info.vectorCount;
    }
  }

  return { totalVectors, collectionStats: stats };
}

/**
 * Get Qdrant cluster info
 */
export async function getClusterInfo(): Promise<{
  healthy: boolean;
  collections: number;
  totalVectors: number;
}> {
  try {
    const client = getQdrantClient();
    const collectionsResult = await client.getCollections();

    let totalVectors = 0;
    for (const col of collectionsResult.collections) {
      try {
        const info = await client.getCollection(col.name);
        totalVectors += info.points_count || 0;
      } catch {
        // Skip collections we can't read
      }
    }

    return {
      healthy: true,
      collections: collectionsResult.collections.length,
      totalVectors,
    };
  } catch (error) {
    return {
      healthy: false,
      collections: 0,
      totalVectors: 0,
    };
  }
}

export default {
  getQdrantClient,
  createCollection,
  provisionTenantCollections,
  getCollectionInfo,
  deleteCollection,
  upsertVectors,
  searchVectors,
  deleteVectors,
  getVectors,
  healthCheck,
  // Aliases
  vectorSearch,
  upsertPoints,
  deletePointsByFilter,
  buildCollectionName,
  isQdrantAvailable,
  deleteTenantCollections,
  multiCollectionSearch,
  getTenantStats,
  getClusterInfo,
};
