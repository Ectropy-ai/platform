/**
 * ============================================================================
 * DEC-031: Speckle Data Plane Auth Endpoint
 * ============================================================================
 *
 * Lightweight auth validation endpoint for nginx's auth_request directive.
 *
 * ## The auth_request pattern (why this file exists)
 *
 * nginx's `auth_request` directive lets a location block issue an internal
 * subrequest to another location BEFORE proxying the user's actual request.
 * If the subrequest returns 2xx, nginx proxies the real request. If 4xx/5xx,
 * nginx rejects with 401/403 and never opens the upstream connection.
 *
 * DEC-031 uses this to move Speckle /objects/* streaming OUT of the api-gateway
 * Node.js process (naive recursive pump — saturated HTTP/2 flow control) and
 * INTO nginx (native C backpressure handling with proxy_buffering). The auth
 * decision still lives in the control plane (api-gateway) so policy logic stays
 * centralized. Only the bytes move via the data plane (nginx direct proxy).
 *
 * ## How it fits in the request flow
 *
 * Browser → nginx → (subrequest) → api-gateway /internal/speckle-auth → 200/401
 *                 ↓ (if 200)
 *                 → ectropy-speckle-server:3000/objects/... → browser
 *
 * The Speckle server is never reached if auth fails. The api-gateway is never
 * in the data path — it's just consulted for the auth decision (one round-trip,
 * <5ms inside the Docker network).
 *
 * ## Auth contract
 *
 * Accepts EITHER:
 * - Bearer VST (Viewer Session Token) — used by @speckle/viewer SDK
 * - Session cookie (Passport.js) — used by browser/fetch calls
 *
 * The `internal` directive on the nginx location block ensures this endpoint
 * is ONLY callable as a subrequest — never exposed to the browser.
 *
 * ## Response contract
 *
 * Success (authorized):
 *   - HTTP 200
 *   - Header: X-Auth-Status: valid
 *   - Body: EMPTY (non-empty breaks nginx HTTP keepalive per nginx docs)
 *
 * Failure (unauthorized):
 *   - HTTP 401
 *   - Body: EMPTY
 *
 * Must complete within 5s (nginx auth_request timeout).
 *
 * @module routes/internal/speckle-auth
 */

import { Request, Response, Router } from 'express';
import { verifyViewerToken } from '../../auth/viewer-token';
import { logger } from '../../../../../libs/shared/utils/src/logger.js';

const router: Router = Router();

/**
 * Validate inbound request for Speckle data-plane access.
 *
 * Checks in order:
 *  1. Bearer VST in Authorization header (@speckle/viewer SDK path)
 *  2. Passport session cookie (browser fetch path)
 *
 * Returns 200 with empty body on success, 401 with empty body on failure.
 * Never returns a body — nginx auth_request requires empty response for
 * HTTP keepalive integrity.
 *
 * @route GET /internal/speckle-auth
 * @returns {void} HTTP 200 (valid) or HTTP 401 (invalid)
 */
router.get('/', (req: Request, res: Response): void => {
  // Path 1: Bearer VST (preserves existing @speckle/viewer SDK flow)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyViewerToken(token);
    if (payload) {
      res.setHeader('X-Auth-Status', 'valid');
      res.status(200).end();
      return;
    }
  }

  // Path 2: Session cookie (Passport.js via req.user)
  // Passport's deserializeUser populates req.user from the session store
  const user = (req as Request & { user?: { id?: string } }).user;
  if (user?.id) {
    res.setHeader('X-Auth-Status', 'valid');
    res.status(200).end();
    return;
  }

  // No valid credential
  logger.debug('[DEC-031] /internal/speckle-auth rejected', {
    originalUri: req.headers['x-original-uri'],
    hasBearer: !!authHeader?.startsWith('Bearer '),
    hasCookie: !!req.headers.cookie,
  });
  res.status(401).end();
});

export default router;
