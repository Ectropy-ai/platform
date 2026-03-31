/**
 * @fileoverview IBundleLoader — loads and validates versioned bundles
 * from DO Spaces or local fixture (for tests).
 *
 * Contract guarantees:
 *   - Returns a validated IntakeBundle or throws BundleValidationError
 *   - Never returns a bundle with missing required refs
 *   - SHA256 verification performed when bundle.ifc is non-null
 *   - Idempotent: loading same bundle twice returns structurally equal objects
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part II
 */

import type { IntakeBundle, BundleManifestEntry } from './bundle.types';

export interface IBundleLoader {
  /**
   * Load and validate a bundle by id and version.
   * @throws {BundleValidationError} if bundle is malformed or refs are missing
   * @throws {SHA256MismatchError} if IFC file hash does not match bundle.json
   * @throws {BundleNotFoundError} if bundle_id/version does not exist
   */
  load(bundleId: string, version: string): Promise<IntakeBundle>;

  /** List all available bundles in the configured store. */
  listAvailable(): Promise<BundleManifestEntry[]>;
}

export class BundleValidationError extends Error {
  constructor(
    public readonly bundleId: string,
    public readonly reason: string,
  ) {
    super(`Bundle '${bundleId}' failed validation: ${reason}`);
    this.name = 'BundleValidationError';
  }
}

export class SHA256MismatchError extends Error {
  constructor(
    public readonly filename: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`SHA256 mismatch for '${filename}': expected ${expected}, got ${actual}`);
    this.name = 'SHA256MismatchError';
  }
}

export class BundleNotFoundError extends Error {
  constructor(bundleId: string, version: string) {
    super(`Bundle '${bundleId}@${version}' not found`);
    this.name = 'BundleNotFoundError';
  }
}
