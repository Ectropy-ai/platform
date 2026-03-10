import type { Request, Response, NextFunction } from 'express';

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Development mode - skip auth for now
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  const header = req.headers.authorization;
  const token =
    typeof header === 'string' ? header.replace('Bearer ', '') : undefined;
  if (!token || token !== process.env.API_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

/**
 * API Key Authentication Middleware for External MCP Access
 * Validates X-API-Key header or apiKey query parameter
 */
export const validateApiKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Get API key from header or query parameter
  const apiKeyHeader = req.headers['x-api-key'];
  const apiKeyQuery = req.query.apiKey;
  const apiKey = apiKeyHeader || apiKeyQuery;

  // Get expected API key from environment
  const expectedApiKey = process.env.MCP_API_KEY;

  // If no API key is configured, allow access in development
  if (!expectedApiKey && process.env.NODE_ENV === 'development') {
    return next();
  }

  // Validate API key
  if (!apiKey || apiKey !== expectedApiKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
      code: 'INVALID_API_KEY',
    });
    return;
  }

  next();
};
