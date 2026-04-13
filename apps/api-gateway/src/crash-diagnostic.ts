/**
 * @fileoverview Crash diagnostic uploader.
 *
 * Uploads runtime crash details (uncaughtException /
 * unhandledRejection) to DO Spaces before process.exit(1).
 * Fire-and-forget with a hard 3-second timeout — never
 * blocks exit, never throws.
 *
 * Output path: diagnostics/runtime-<kind>-<timestamp>.txt
 *
 * @module crash-diagnostic
 */
import { SpacesClient, spacesConfigFromEnv } from './intake/spaces-client';

/**
 * Uploads a crash diagnostic to Spaces.
 * Resolves in ≤3s regardless of upload success.
 *
 * @param kind   - 'uncaughtException' | 'unhandledRejection'
 * @param summary - Error message + stack trace as a string
 */
export async function uploadCrashDiagnostic(
  kind: 'uncaughtException' | 'unhandledRejection',
  summary: string,
): Promise<void> {
  try {
    const client = new SpacesClient(spacesConfigFromEnv());
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `diagnostics/runtime-${kind}-${ts}.txt`;
    // Best-effort counts — these APIs are unstable but present in Node 20.
    // Cast to `any` because TypeScript types omit them.
    const handles = (process as any)._getActiveHandles?.().length ?? 'n/a';
    const requests = (process as any)._getActiveRequests?.().length ?? 'n/a';
    const rss_mb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const body = [
      `timestamp:  ${new Date().toISOString()}`,
      `kind:       ${kind}`,
      `pid:        ${process.pid}`,
      `uptime_s:   ${process.uptime().toFixed(2)}`,
      `node:       ${process.version}`,
      `env:        ${process.env.NODE_ENV ?? 'unknown'}`,
      `memory_mb:  ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}`,
      `rss_mb:     ${rss_mb}`,
      `handles:    ${handles}`,
      `requests:   ${requests}`,
      `---`,
      summary,
    ].join('\n');
    await Promise.race([
      client.putText(key, body),
      new Promise<void>((_, rej) =>
        setTimeout(() => rej(new Error('upload-timeout')), 3000),
      ),
    ]);
  } catch {
    // Swallow all errors — never block process.exit(1)
  }
}
