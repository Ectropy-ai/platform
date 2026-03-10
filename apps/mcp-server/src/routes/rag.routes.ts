/**
 * RAG API Routes
 *
 * REST API endpoints for the RAG layer.
 *
 * @module routes/rag
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import {
  ragService,
  RagSearchRequest,
  IndexRequest,
  EmbedRequest,
  RagCollectionName,
  RAG_COLLECTION_LIST,
  DocumentType,
} from '../services/rag/index.js';

const router: ReturnType<typeof Router> = Router();

// ==============================================================================
// Search Endpoints
// ==============================================================================

/**
 * POST /api/rag/search
 * Perform RAG search and return assembled context
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const {
      query,
      projectId,
      tenantId,
      authorityLevel,
      collections,
      filters,
      limit,
      includeMetadata,
    } = req.body;

    if (!query || !projectId || !tenantId) {
      return res.status(400).json({
        error: 'Missing required fields: query, projectId, tenantId',
      });
    }

    const request: RagSearchRequest = {
      query,
      projectId,
      tenantId,
      authorityLevel: authorityLevel ?? 0,
      collections: collections as RagCollectionName[],
      filters,
      limit,
      includeMetadata,
    };

    const result = await ragService.search(request);

    return res.json({
      success: true,
      data: {
        chunks: result.chunks,
        citations: result.citations,
        assembledContext: result.assembledContext,
        metadata: result.metadata,
      },
    });
  } catch (error: any) {
    console.error('RAG search error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'SEARCH_FAILED',
    });
  }
});

// ==============================================================================
// Embed Endpoint
// ==============================================================================

/**
 * POST /api/rag/embed
 * Generate embedding and store in collection
 */
router.post('/embed', async (req: Request, res: Response) => {
  try {
    const { content, collectionName, metadata } = req.body;

    if (!content || !collectionName || !metadata?.tenantId) {
      return res.status(400).json({
        error: 'Missing required fields: content, collectionName, metadata.tenantId',
      });
    }

    if (!RAG_COLLECTION_LIST.includes(collectionName)) {
      return res.status(400).json({
        error: `Invalid collection name. Must be one of: ${RAG_COLLECTION_LIST.join(', ')}`,
      });
    }

    const request: EmbedRequest = {
      content,
      collectionName: collectionName as RagCollectionName,
      metadata,
    };

    const result = await ragService.embed(request);

    return res.json({
      success: true,
      data: {
        vectorId: result.vectorId,
        dimensions: result.dimensions,
        contentHash: result.contentHash,
      },
    });
  } catch (error: any) {
    console.error('RAG embed error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'EMBEDDING_FAILED',
    });
  }
});

// ==============================================================================
// Index Endpoint
// ==============================================================================

/**
 * POST /api/rag/index
 * Index a document (URL or content)
 */
router.post('/index', async (req: Request, res: Response) => {
  try {
    const {
      documentUrl,
      documentContent,
      documentType,
      projectId,
      tenantId,
      metadata,
    } = req.body;

    if ((!documentUrl && !documentContent) || !documentType || !projectId || !tenantId) {
      return res.status(400).json({
        error: 'Missing required fields: (documentUrl or documentContent), documentType, projectId, tenantId',
      });
    }

    const validDocTypes: DocumentType[] = [
      'specification', 'drawing', 'rfi', 'submittal', 'decision',
      'voxel_data', 'conversation', 'safety_document', 'contract',
      'change_order', 'inspection_report', 'other',
    ];

    if (!validDocTypes.includes(documentType)) {
      return res.status(400).json({
        error: `Invalid document type. Must be one of: ${validDocTypes.join(', ')}`,
      });
    }

    const request: IndexRequest = {
      documentUrl,
      documentContent,
      documentType: documentType as DocumentType,
      projectId,
      tenantId,
      metadata,
    };

    const result = await ragService.indexDocument(request);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.errors?.[0] || 'Indexing failed',
        chunksCreated: result.chunksCreated,
      });
    }

    return res.json({
      success: true,
      data: {
        chunksCreated: result.chunksCreated,
        vectorIds: result.vectorIds,
        processingTimeMs: result.processingTimeMs,
      },
    });
  } catch (error: any) {
    console.error('RAG index error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'INDEX_FAILED',
    });
  }
});

// ==============================================================================
// Collection Management
// ==============================================================================

/**
 * POST /api/rag/collections/initialize
 * Initialize collections for a tenant
 */
router.post('/collections/initialize', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'Missing required field: tenantId' });
    }

    await ragService.initializeTenant(tenantId);

    return res.json({
      success: true,
      message: `Initialized ${RAG_COLLECTION_LIST.length} collections for tenant ${tenantId}`,
      collections: RAG_COLLECTION_LIST,
    });
  } catch (error: any) {
    console.error('RAG collection init error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/rag/collections/status
 * Get collection status for a tenant
 */
router.get('/collections/status', async (req: Request, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string;

    if (!tenantId) {
      return res.status(400).json({ error: 'Missing required query param: tenantId' });
    }

    const status = await ragService.getTenantCollectionStatus(tenantId);

    return res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error('RAG collection status error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==============================================================================
// Delete Operations
// ==============================================================================

/**
 * DELETE /api/rag/vectors
 * Delete vectors by IDs
 */
router.delete('/vectors', async (req: Request, res: Response) => {
  try {
    const { tenantId, collectionName, vectorIds } = req.body;

    if (!tenantId || !collectionName || !vectorIds?.length) {
      return res.status(400).json({
        error: 'Missing required fields: tenantId, collectionName, vectorIds',
      });
    }

    await ragService.deleteVectorsByIds(tenantId, collectionName as RagCollectionName, vectorIds);

    return res.json({
      success: true,
      message: `Deleted ${vectorIds.length} vectors`,
    });
  } catch (error: any) {
    console.error('RAG delete error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==============================================================================
// Health Check
// ==============================================================================

/**
 * GET /api/rag/health
 * Health check for RAG system
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await ragService.healthCheck();

    const statusCode = health.healthy ? 200 : 503;

    return res.status(statusCode).json({
      success: health.healthy,
      ...health,
    });
  } catch (error: any) {
    console.error('RAG health check error:', error);
    return res.status(503).json({
      success: false,
      healthy: false,
      error: error.message,
    });
  }
});

export default router;
