/**
 * SpeckleTokenService — DEC-018
 *
 * Ensures the Speckle service token is present in the Speckle PostgreSQL
 * api_tokens table before the api-gateway starts serving requests.
 *
 * Root cause addressed: Speckle PostgreSQL container recreation orphans
 * the api_tokens row while the shared volume token persists. This caused
 * tokenStatus:invalid 5 times since 2026-03-13.
 *
 * Strategy: Read-validate-mint on every api-gateway startup.
 * Idempotent. Fail-fast if token cannot be ensured.
 */

import * as fs from 'fs';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

const SHARED_TOKEN_PATH = '/shared-tokens/speckle-service-token';
const TOKEN_LENGTH = 42;
const TOKEN_ID_LENGTH = 10;
const SPECKLE_ADMIN_USER_ID = '120f42c1e6';
const BCRYPT_ROUNDS = 10;
const TOKEN_SCOPES = '{streams:read,streams:write,users:read,server:stats}';

export interface SpeckleTokenResult {
  status: 'valid' | 'minted';
  prefix: string;
}

/**
 * Ensures the Speckle service token exists in the Speckle PostgreSQL
 * api_tokens table. Called in bootstrap() before server.listen().
 * Server will not start if this throws.
 *
 * @throws If shared volume token is missing, malformed, or DB unreachable.
 */
export async function ensureSpeckleToken(): Promise<SpeckleTokenResult> {
  // Step 1 — Read raw token from shared volume
  let rawToken: string;
  try {
    rawToken = fs.readFileSync(SHARED_TOKEN_PATH, 'utf8').trim();
  } catch {
    throw new Error(
      `[SpeckleToken] Shared volume token not found at ${SHARED_TOKEN_PATH}` +
      ' — cannot start without Speckle service token'
    );
  }

  if (!rawToken || rawToken.length === 0) {
    throw new Error('[SpeckleToken] Shared volume token is empty');
  }

  // Step 2 — Validate token length
  if (rawToken.length !== TOKEN_LENGTH) {
    throw new Error(
      `[SpeckleToken] Token malformed — expected ${TOKEN_LENGTH} chars,` +
      ` got ${rawToken.length}`
    );
  }

  // Step 3 — Split into tokenId + tokenSecret
  const tokenId = rawToken.slice(0, TOKEN_ID_LENGTH);
  const tokenSecret = rawToken.slice(TOKEN_ID_LENGTH);
  const prefix = rawToken.slice(0, 8);

  // Step 4 — Validate SPECKLE_DB_URL
  const speckleDbUrl = process.env['SPECKLE_DB_URL'];
  if (!speckleDbUrl) {
    throw new Error(
      '[SpeckleToken] SPECKLE_DB_URL not configured' +
      ' — cannot connect to Speckle database'
    );
  }

  const pool = new Pool({
    connectionString: speckleDbUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 10000,
  });

  try {
    // Step 5 — Check if token row exists and is not revoked
    const existing = await pool.query<{ id: string }>(
      'SELECT id FROM api_tokens WHERE id = $1 AND NOT revoked LIMIT 1',
      [tokenId]
    );

    if (existing.rows.length > 0) {
      logger.info(
        `[SpeckleToken] Service token verified in DB (prefix: ${prefix})`
      );
      return { status: 'valid', prefix };
    }

    // Step 6 — Token is orphaned — re-mint via bcrypt INSERT
    logger.warn(
      `[SpeckleToken] Token orphaned (prefix: ${prefix}) — re-minting...`
    );

    const tokenDigest = await bcrypt.hash(tokenSecret, BCRYPT_ROUNDS);

    await pool.query(
      `INSERT INTO api_tokens
         (id, name, "tokenDigest", "userId",
          "createdAt", "lifespan", "lastUsed", revoked, scopes)
       VALUES ($1, 'ectropy-service-token', $2, $3,
               NOW(), NULL, NOW(), false, $4)
       ON CONFLICT (id) DO UPDATE SET
         "tokenDigest" = EXCLUDED."tokenDigest",
         revoked = false`,
      [tokenId, tokenDigest, SPECKLE_ADMIN_USER_ID, TOKEN_SCOPES]
    );

    logger.info(
      `[SpeckleToken] Token minted successfully (prefix: ${prefix})`
    );
    return { status: 'minted', prefix };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[SpeckleToken] DB error: ${message}`);
  } finally {
    await pool.end();
  }
}
