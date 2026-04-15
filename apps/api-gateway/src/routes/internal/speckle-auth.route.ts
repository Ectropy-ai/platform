/**
 * ============================================================================
 * DEC-031: Speckle Data Plane Auth Endpoint (with Token Swap)
 * ============================================================================
 *
 * Lightweight auth validation endpoint for nginx's auth_request directive.
 * Performs the VST → Speckle service token swap that the old pump proxy did
 * inline (speckle.routes.enterprise.ts:852). nginx captures the service token
 * via auth_request_set and injects it into the proxy request to Speckle.
 *
 * ## The auth_request pattern (why this file exists)
 *
 * nginx's `auth_request` directive lets a location block issue an internal
 * subrequest to another location BEFORE proxying the user's actual request.
 * If the subrequest returns 2xx, nginx proxies the real request. If 4xx/5xx,
 * nginx rejects with 401/403 and never opens the upstream connection.
 *
 * auth_request_set captures headers from the subrequest response, which lets
 * this endpoint return the upstream credential nginx should use.
 *
 * DEC-031 uses this to move Speckle /objects/* streaming OUT of the api-gateway
 * Node.js process (naive recursive pump — saturated HTTP/2 flow control) and
 * INTO nginx (native C backpressure handling with proxy_buffering). The auth
 * decision still lives in the control plane (api-gateway) so policy logic stays
 * centralized. Only the bytes move via the data plane (nginx direct proxy).
 *
 * ## How it fits in the request flow
 *
 * Browser → nginx → (subrequest) → api-gateway /internal/speckle-auth → 200 + X-Speckle-Token
 *                 ↓ (if 200, nginx captures X-Speckle-Token via auth_request_set)
 *                 → ectropy-speckle-server:3000/objects/... (with Bearer service-token) → browser
 *
 * The Speckle server is never reached if auth fails. The api-gateway is never
 * in the data path — it's just consulted for the auth decision + token swap
 * (one round-trip, <5ms inside the Docker network).
 *
 * ## Auth contract (browser credential → service token)
 *
 * Validates EITHER:
 * - Bearer VST (Viewer Session Token) — used by @speckle/viewer SDK
 * - Session cookie (Passport.js) — used by browser/fetch calls
 *
 * Then swaps to the Speckle service token (same token the old pump proxy used)
 * for the upstream request. This preserves VST stream-scope ACLs at the control
 * plane while giving Speckle the credential it actually recognizes.
 *
 * The `internal` directive on the nginx location block ensures this endpoint
 * is ONLY callable as a subrequest — never exposed to the browser.
 *
 * ## Stream-scope ACL enforcement (DEC-028 SEC-001 parity)
 *
 * When the browser presents a Bearer VST, the token's `streamId` claim MUST
 * match the `:streamId` path parameter in the actual request URI. This is
 * the same stream-scope check the old `requireViewerToken` middleware
 * enforced on the pump proxy path — preserving it on the new data-plane
 * route means DEC-031 has ZERO security relaxation versus the old path.
 *
 * The URI is read from nginx's `X-Original-URI` header (set by the
 * subrequest location block). Pattern:
 *   /api/speckle/objects/<streamId>/<objectId>[/single][?...]
 *
 * On mismatch → HTTP 403 (forbidden). Session-cookie auth is not subject
 * to this check (session already carries user identity; stream ACL is
 * enforced by other routes in the control plane).
 *
 * ## Response contract
 *
 * Success (authorized):
 *   - HTTP 200
 *   - Header: X-Auth-Status: valid
 *   - Header: X-Speckle-Token: <service-token>  (captured by nginx, NOT forwarded to browser)
 *   - Body: EMPTY (non-empty breaks nginx HTTP keepalive per nginx docs)
 *
 * Failure (unauthorized):
 *   - HTTP 401
 *   - Body: EMPTY
 *
 * Failure (VST stream-scope violation — VST streamId ≠ URI streamId):
 *   - HTTP 403
 *   - Body: EMPTY
 *
 * Failure (service token unavailable):
 *   - HTTP 503
 *   - Body: EMPTY
 *
 * Must complete within 5s (nginx auth_request timeout).
 *
 * ## Security note on token leakage
 *
 * - X-Speckle-Token is captured by nginx via auth_request_set and injected
 *   into the upstream request. nginx does NOT pass subrequest headers back to
 *   the browser by default.
 * - The token is never written to nginx access_log (log_format in main.conf
 *   only records request/response metadata, not proxy_set_header values).
 * - This endpoint has the `internal;` directive so it's unreachable externally.
 *
 * @module routes/internal/speckle-auth
 */

import { Request, Response, Router } from 'express';
import { verifyViewerToken, ViewerTokenPayload } from '../../auth/viewer-token';
import { getSpeckleToken } from '../speckle.routes.enterprise.js';
import { logger } from '../../../../../libs/shared/utils/src/logger.js';

const router: Router = Router();

/**
 * Validate inbound request for Speckle data-plane access and swap to service token.
 *
 * Flow:
 *  1. Validate browser credential (Bearer VST OR session cookie)
 *  2. Enforce VST stream-scope: token streamId must match URI streamId
 *     (DEC-028 SEC-001 parity — preserved from old requireViewerToken path)
 *  3. On success, fetch the Speckle service token via getSpeckleToken()
 *     (reuses existing token resolution chain — Docker volume or env var)
 *  4. Return 200 with X-Speckle-Token header so nginx can inject it into
 *     the upstream proxy request to Speckle server
 *
 * @route GET /internal/speckle-auth
 * @returns {Promise<void>} HTTP 200 (valid + token) | 401 (invalid) | 403 (stream-scope) | 503 (token unavailable)
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  // ── Step 1: Validate browser credential ────────────────────────────────
  let authorized = false;
  let vstPayload: ViewerTokenPayload | null = null;

  // Path 1: Bearer VST (preserves existing @speckle/viewer SDK flow)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    vstPayload = verifyViewerToken(token);
    if (vstPayload) {
      authorized = true;
    }
  }

  // Path 2: Session cookie (Passport.js via req.user)
  if (!authorized) {
    const user = (req as Request & { user?: { id?: string } }).user;
    if (user?.id) {
      authorized = true;
    }
  }

  if (!authorized) {
    logger.debug('[DEC-031] /internal/speckle-auth rejected', {
      originalUri: req.headers['x-original-uri'],
      hasBearer: !!authHeader?.startsWith('Bearer '),
      hasCookie: !!req.headers.cookie,
    });
    res.status(401).end();
    return;
  }

  // ── Step 2: Stream-scope ACL enforcement (VST path only) ───────────────
  // DEC-028 SEC-001 parity: VST tokens carry a streamId claim that MUST
  // match the :streamId path parameter. Prevents cross-stream token reuse.
  // Session-cookie auth is not subject to this — stream ACL is enforced
  // elsewhere in the control plane for session-authenticated requests.
  if (vstPayload?.streamId) {
    const originalUri = req.headers['x-original-uri'] as string | undefined;
    if (originalUri) {
      const uriStreamId = originalUri
        .split('/api/speckle/objects/')[1]
        ?.split('/')[0]
        ?.split('?')[0];
      if (uriStreamId && uriStreamId !== vstPayload.streamId) {
        logger.warn('[DEC-031] VST stream-scope violation', {
          tokenStream: vstPayload.streamId,
          uriStream: uriStreamId,
          userId: vstPayload.sub,
        });
        res.status(403).end();
        return;
      }
    }
  }

  // ── Step 3: Fetch Speckle service token for upstream auth ──────────────
  // Reuses getSpeckleToken() — same function the old pump proxy used
  // (speckle.routes.enterprise.ts:852). Resolves from Docker volume or env var.
  let serviceToken: string;
  try {
    serviceToken = await getSpeckleToken();
  } catch (err) {
    logger.error('[DEC-031] getSpeckleToken() threw', { err });
    res.status(503).end();
    return;
  }

  if (!serviceToken || serviceToken === 'REPLACE_WITH_TOKEN_AFTER_ADMIN_SETUP') {
    logger.warn('[DEC-031] Speckle service token not configured', {
      hasToken: !!serviceToken,
    });
    res.status(503).end();
    return;
  }

  // ── Step 4: Return 200 with X-Speckle-Token for nginx auth_request_set ─
  res.setHeader('X-Auth-Status', 'valid');
  res.setHeader('X-Speckle-Token', serviceToken);
  res.status(200).end();
});

export default router;
