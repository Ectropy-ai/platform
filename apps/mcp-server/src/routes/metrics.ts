import { type Router, Router as createRouter } from 'express';
import { register, collectDefaultMetrics } from 'prom-client';

// Import MCP metrics
import { mcpMetrics } from '../metrics/mcp-metrics.js';

// Initialize metrics
collectDefaultMetrics({ register });

export const metricsRouter: Router = createRouter();

metricsRouter.get('/', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// Health endpoint with metrics summary
metricsRouter.get('/health', async (req, res) => {
  try {
    const metrics = await register.metrics();
    const isHealthy = metrics.length > 0;

    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      metrics_available: isHealthy,
      uptime: process.uptime(),
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      error: error?.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

export { mcpMetrics };
