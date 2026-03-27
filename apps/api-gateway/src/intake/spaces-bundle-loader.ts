/**
 * @fileoverview SpacesBundleLoader — production implementation of IBundleLoader.
 *
 * Loads versioned IntakeBundles from DO Spaces.
 *
 * DO Spaces directory layout (from INTAKE-ARCHITECTURE-2026-03-27.md Part VII):
 *   ectropy-config/
 *     demo-library/{bundle_id}/bundle.json        <- DEMO bundles
 *     project-bundles/{bundle_id}/bundle.json     <- PILOT/CI bundles
 *
 * Bundle lookup order:
 *   1. demo-library/{bundleId}/bundle.json
 *   2. project-bundles/{bundleId}/bundle.json
 *
 * SHA256 verification:
 *   When bundle.ifc is non-null, each IFC file's SHA256 is verified
 *   against the hash declared in bundle.ifc.files[].sha256.
 *   Files with sha256="PENDING" are skipped (fixture/dev mode only).
 *
 * @see apps/api-gateway/src/intake/interfaces/bundle-loader.interface.ts
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Parts II and VII
 */

import type { IBundleLoader } from './interfaces/bundle-loader.interface';
import {
  BundleValidationError,
  BundleNotFoundError,
  SHA256MismatchError,
} from './interfaces/bundle-loader.interface';
import type { IntakeBundle, BundleManifestEntry } from './interfaces/bundle.types';
import {
  SpacesClient,
  SpacesKeyNotFoundError,
  type SpacesClientConfig,
  spacesConfigFromEnv,
} from './spaces-client';

/** Paths within the ectropy-config bucket where bundles live. */
const BUNDLE_SEARCH_PREFIXES = [
  'demo-library',
  'project-bundles',
] as const;

const REQUIRED_DEMO_FLAGS = [
  'voxelize',
  'apply_takt',
  'seed_decisions',
  'inject_seppa_context',
  'precompute_ai_analysis',
] as const;

export class SpacesBundleLoader implements IBundleLoader {
  private readonly spaces: SpacesClient;

  constructor(configOrSpaces?: SpacesClientConfig | SpacesClient) {
    if (configOrSpaces && typeof (configOrSpaces as SpacesClient).getText === 'function') {
      this.spaces = configOrSpaces as SpacesClient;
    } else {
      this.spaces = new SpacesClient((configOrSpaces as SpacesClientConfig) ?? spacesConfigFromEnv());
    }
  }

  async load(bundleId: string, version: string): Promise<IntakeBundle> {
    const raw = await this.fetchBundleJson(bundleId);
    const bundle = this.parseAndValidate(bundleId, raw);

    if (bundle.bundle_version !== version) {
      throw new BundleValidationError(
        bundleId,
        `Version mismatch: requested '${version}', found '${bundle.bundle_version}'`,
      );
    }

    await this.verifyIfcHashes(bundle);
    return bundle;
  }

  async listAvailable(): Promise<BundleManifestEntry[]> {
    const entries: BundleManifestEntry[] = [];

    for (const prefix of BUNDLE_SEARCH_PREFIXES) {
      const keys = await this.spaces.listKeys(`${prefix}/`);
      const bundleKeys = keys.filter(k => k.endsWith('/bundle.json'));

      for (const key of bundleKeys) {
        try {
          const raw = await this.spaces.getText(key);
          const parsed = JSON.parse(raw) as Partial<IntakeBundle>;
          if (parsed.bundle_id && parsed.bundle_version && parsed.bundle_type) {
            entries.push({
              bundle_id: parsed.bundle_id,
              bundle_version: parsed.bundle_version,
              bundle_type: parsed.bundle_type,
              created_at: parsed.created_at ?? new Date().toISOString(),
            });
          }
        } catch {
          // Skip unreadable bundle files
        }
      }
    }

    return entries;
  }

  // ─── Private ────────────────────────────────────────────────────

  private async fetchBundleJson(bundleId: string): Promise<string> {
    for (const prefix of BUNDLE_SEARCH_PREFIXES) {
      const key = `${prefix}/${bundleId}/bundle.json`;
      try {
        return await this.spaces.getText(key);
      } catch (err) {
        if (err instanceof SpacesKeyNotFoundError) continue;
        throw err;
      }
    }
    throw new BundleNotFoundError(bundleId, 'any');
  }

  private parseAndValidate(bundleId: string, raw: string): IntakeBundle {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BundleValidationError(bundleId, 'bundle.json is not valid JSON');
    }

    const b = parsed as Record<string, unknown>;

    const required = [
      'bundle_id', 'bundle_version', 'bundle_type',
      'schema_version', 'tenant', 'project', 'pipeline_flags',
    ];
    for (const field of required) {
      if (b[field] === undefined || b[field] === null) {
        throw new BundleValidationError(bundleId, `Missing required field: '${field}'`);
      }
    }

    const validTypes = ['DEMO', 'PILOT', 'CI'];
    if (!validTypes.includes(b['bundle_type'] as string)) {
      throw new BundleValidationError(
        bundleId,
        `Invalid bundle_type '${b['bundle_type']}'. Must be one of: ${validTypes.join(', ')}`,
      );
    }

    const flags = b['pipeline_flags'] as Record<string, unknown> | undefined;
    if (!flags || typeof flags !== 'object') {
      throw new BundleValidationError(bundleId, 'pipeline_flags must be an object');
    }
    const flagKeys = [
      'voxelize', 'apply_takt', 'seed_decisions',
      'inject_seppa_context', 'precompute_ai_analysis', 'assign_demo_user',
    ];
    for (const key of flagKeys) {
      if (typeof flags[key] !== 'boolean') {
        throw new BundleValidationError(bundleId, `pipeline_flags.${key} must be a boolean`);
      }
    }

    if (b['bundle_type'] === 'DEMO' && !b['ifc']) {
      throw new BundleValidationError(bundleId, 'DEMO bundle must have a non-null ifc field');
    }

    if (b['bundle_type'] === 'DEMO') {
      for (const flag of REQUIRED_DEMO_FLAGS) {
        if (flags[flag] !== true) {
          throw new BundleValidationError(
            bundleId,
            `DEMO bundle must have pipeline_flags.${flag} = true`,
          );
        }
      }
    }

    return parsed as IntakeBundle;
  }

  private async verifyIfcHashes(bundle: IntakeBundle): Promise<void> {
    if (!bundle.ifc) return;

    for (const file of bundle.ifc.files) {
      if (file.sha256 === 'PENDING') continue;

      const key = `${bundle.ifc.base_path}${file.filename}`;
      let actual: string;
      try {
        actual = await this.spaces.getSHA256(key);
      } catch (err) {
        if (err instanceof SpacesKeyNotFoundError) {
          throw new BundleValidationError(
            bundle.bundle_id,
            `IFC file not found in Spaces: '${key}'`,
          );
        }
        throw err;
      }

      if (actual !== file.sha256) {
        throw new SHA256MismatchError(file.filename, file.sha256, actual);
      }
    }
  }
}
