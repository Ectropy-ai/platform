/**
 * requireViewerToken middleware — DEC-015
 *
 * Validates a Viewer Session Token (VST) on geometry proxy routes.
 * Replaces requireAuth on routes that serve binary geometry data to the
 * Speckle viewer SDK. The SDK cannot send session cookies — VST is the
 * correct credential for this transport layer.
 *
 * Stream-scope enforcement: the streamId in the JWT payload must match
 * the :streamId route parameter. Cross-stream token reuse is rejected.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyViewerToken } from '../auth/viewer-token';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

export function requireViewerToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Viewer authentication required',
      message:
        'A valid viewer session token is required for geometry access',
    });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyViewerToken(token);

  if (!payload) {
    res.status(401).json({
      error: 'Invalid or expired viewer token',
      message:
        'Request a new viewer token via the project streams endpoint',
    });
    return;
  }

  // Enforce stream-scope: token must be scoped to the requested stream
  const routeStreamId = req.params.streamId;
  if (routeStreamId && payload.streamId !== routeStreamId) {
    logger.warn('[VST] Stream scope violation', {
      tokenStream: payload.streamId,
      requestedStream: routeStreamId,
      userId: payload.sub,
    });
    res.status(403).json({
      error: 'Token not authorized for this stream',
      message: 'Viewer token is scoped to a different stream',
    });
    return;
  }

  // Attach to request for downstream logging
  (req as any).viewerSession = payload;
  next();
}
