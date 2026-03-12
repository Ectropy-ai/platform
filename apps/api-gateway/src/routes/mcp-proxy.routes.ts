/**
 * MCP Server Proxy Routes
 * Proxies requests from API Gateway (port 4000) to MCP Server (port 3002)
 */

import { Router, Request, Response } from 'express';
import type { Router as ExpressRouter } from 'express';
import http from 'http';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

const router: ExpressRouter = Router();

// MCP Server configuration
const MCP_SERVER_HOST = process.env.MCP_SERVER_HOST || 'mcp-server';
const MCP_SERVER_PORT = process.env.MCP_SERVER_PORT || '3002';

/**
 * Proxy all MCP requests to the MCP Server
 * Handles /health, /deliverables, /roadmap, /votes, /graph, etc.
 */
router.all('/*', async (req: Request, res: Response) => {
  const path = req.path;
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const fullPath = queryString ? `${path}?${queryString}` : path;

  logger.info(
    `[MCP Proxy] ${req.method} ${fullPath} -> http://${MCP_SERVER_HOST}:${MCP_SERVER_PORT}/api/mcp${fullPath}`
  );

  const options = {
    hostname: MCP_SERVER_HOST,
    port: MCP_SERVER_PORT,
    path: `/api/mcp${fullPath}`,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${MCP_SERVER_HOST}:${MCP_SERVER_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Forward status code
    res.status(proxyRes.statusCode || 500);

    // Forward headers
    Object.entries(proxyRes.headers).forEach(([key, value]) => {
      if (value) {
        res.setHeader(key, value);
      }
    });

    // Pipe response body
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    logger.error('[MCP Proxy] Error:', error);
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'MCP Server is not responding',
      details: error.message,
    });
  });

  // Forward request body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    proxyReq.write(JSON.stringify(req.body));
  }

  proxyReq.end();
});

export default router;
