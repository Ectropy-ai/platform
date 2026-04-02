/**
 * Viewer Session Token (VST) — DEC-015
 *
 * Short-lived, stream-scoped JWT for browser viewer SDK authentication.
 * The service token (SPECKLE_SERVER_TOKEN) NEVER leaves the server.
 *
 * SOC2 Controls: CC6.1, CC6.2, CC6.3, CC7.2
 * Pattern: Autodesk APS Viewer Token / Trimble Connect Viewer Access Token
 *
 * TTL: 30 minutes (1800s)
 * Scope: single streamId, single projectId, single userId — read-only
 * Rotation: client re-fetches /streams on expiry (React Query refetch)
 */

import jwt from 'jsonwebtoken';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

const VST_TTL_SECONDS = 1800; // 30 minutes

export interface ViewerTokenPayload {
  sub: string; // userId
  streamId: string; // Speckle stream ID — single stream scope
  projectId: string; // Ectropy project UUID
  type: 'viewer'; // discriminator — cannot be used as session token
}

/**
 * Generate a Viewer Session Token.
 * Called server-side only. Never called from client code.
 */
export function generateViewerToken(
  userId: string,
  streamId: string,
  projectId: string,
): string {
  const secret = process.env.VIEWER_TOKEN_SECRET;
  if (!secret) {
    logger.error(
      '[VST] VIEWER_TOKEN_SECRET not set — cannot issue viewer token'
    );
    throw new Error('Viewer token signing unavailable');
  }

  const payload: ViewerTokenPayload = {
    sub: userId,
    streamId,
    projectId,
    type: 'viewer',
  };

  return jwt.sign(payload, secret, {
    expiresIn: VST_TTL_SECONDS,
    issuer: 'ectropy-api',
    audience: 'ectropy-viewer',
  });
}

/**
 * Verify and decode a Viewer Session Token.
 * Returns null on any failure — never throws in middleware.
 */
export function verifyViewerToken(
  token: string,
): ViewerTokenPayload | null {
  const secret = process.env.VIEWER_TOKEN_SECRET;
  if (!secret) return null;

  try {
    const payload = jwt.verify(token, secret, {
      issuer: 'ectropy-api',
      audience: 'ectropy-viewer',
    }) as ViewerTokenPayload;

    // Reject tokens that are not explicitly typed as viewer tokens
    if (payload.type !== 'viewer') return null;

    return payload;
  } catch {
    return null;
  }
}
