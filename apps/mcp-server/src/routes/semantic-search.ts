import { Router } from 'express';
import { rateLimiter } from '../middleware/rate-limiter.js';
// TODO: Import database pool once available
// import { pool } from '@ectropy/database';
import { getCachedSearch, setCachedSearch } from '../services/cache.js';
import { semanticSearchService } from '../services/semantic-search/index.js';

export const semanticSearchRouter: Router = Router();

semanticSearchRouter.post('/', rateLimiter, async (req, res) => {
  const startTime = Date.now();

  try {
    const { query, limit = 10, threshold = 0.7, filters } = req.body;

    // Input validation
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required and must be a string',
      });
    }

    // Check cache first
    const cached = await getCachedSearch(query, limit);
    if (cached) {
      const responseTime = Date.now() - startTime;
      return res.json({
        success: true,
        results: cached,
        metadata: {
          query,
          resultsFound: cached.length,
          cached: true,
          responseTime,
        },
      });
    }

    // Use the new semantic search service with performance monitoring
    const searchResults = await semanticSearchService.search({
      query,
      limit,
      threshold,
      filters,
    });

    // Cache results for future queries
    await setCachedSearch(query, limit, searchResults);

    const responseTime = Date.now() - startTime;

    // Performance monitoring - warn if over 100ms
    if (responseTime > 100) {
      console.warn(
        `⚠️  Semantic search slow: ${responseTime}ms > 100ms target`
      );
    }

    return res.json({
      success: true,
      results: searchResults,
      metadata: {
        query,
        resultsFound: searchResults.length,
        cached: false,
        responseTime,
        performanceTarget: '100ms',
      },
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return res.status(500).json({
      success: false,
      error: 'Search processing failed',
      metadata: { responseTime },
    });
  }
});

// Health check endpoint for semantic search
semanticSearchRouter.get('/health', async (req, res) => {
  try {
    const health = await semanticSearchService.healthCheck();

    return res.json({
      success: true,
      service: 'semantic-search',
      ...health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      service: 'semantic-search',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
