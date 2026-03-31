/**
 * @fileoverview SpacesBundleLoader contract tests.
 * Uses a mock SpacesClient — no real Spaces calls in unit tests.
 *
 * @see apps/api-gateway/src/intake/interfaces/bundle-loader.interface.ts
 * @see apps/api-gateway/src/intake/spaces-bundle-loader.ts
 */

import { SpacesBundleLoader } from '../spaces-bundle-loader';
import { SpacesClient, SpacesKeyNotFoundError } from '../spaces-client';
import {
  BundleValidationError,
  BundleNotFoundError,
  SHA256MismatchError,
} from '../interfaces/bundle-loader.interface';
import type { IntakeBundle } from '../interfaces/bundle.types';

import demoBundleFixture from '../fixtures/bundles/demo-bundle.fixture.json';
import pilotBundleFixture from '../fixtures/bundles/pilot-bundle.fixture.json';
import ciBundleFixture from '../fixtures/bundles/ci-bundle.fixture.json';

/** Build a mock SpacesClient that returns fixture content for known keys. */
function buildMockSpaces(
  store: Record<string, string>,
): SpacesClient {
  const mock = {
    getText: vi.fn(async (key: string) => {
      if (key in store) return store[key];
      throw new SpacesKeyNotFoundError(key);
    }),
    getBuffer: vi.fn(async (key: string): Promise<Buffer> => {
      if (key in store) return Buffer.from(store[key]);
      throw new SpacesKeyNotFoundError(key);
    }),
    getSHA256: vi.fn(async (_key: string) => 'mock-sha256'),
    putText: vi.fn(async () => undefined),
    exists: vi.fn(async (key: string) => key in store),
    listKeys: vi.fn(async (prefix: string) =>
      Object.keys(store).filter(k => k.startsWith(prefix)),
    ),
  } as unknown as SpacesClient;
  return mock;
}

const demoKey = 'demo-library/maple-ridge-commerce-centre/bundle.json';
const pilotKey = 'project-bundles/inca-boardline-alberta/bundle.json';
const ciKey = 'project-bundles/ci-baseline/bundle.json';

describe('SpacesBundleLoader — contract tests', () => {
  describe('load() — happy path', () => {
    it('loads a valid DEMO bundle and returns a typed IntakeBundle', async () => {
      const spaces = buildMockSpaces({
        [demoKey]: JSON.stringify(demoBundleFixture),
      });
      const loader = new SpacesBundleLoader(spaces);
      const bundle = await loader.load('maple-ridge-commerce-centre', '1.0.0');
      expect(bundle.bundle_id).toBe('maple-ridge-commerce-centre');
      expect(bundle.bundle_type).toBe('DEMO');
      expect(bundle.ifc).not.toBeNull();
    });

    it('loads a valid PILOT bundle with ifc=null', async () => {
      const spaces = buildMockSpaces({
        [pilotKey]: JSON.stringify(pilotBundleFixture),
      });
      const loader = new SpacesBundleLoader(spaces);
      const bundle = await loader.load('inca-boardline-alberta', '1.0.0');
      expect(bundle.bundle_type).toBe('PILOT');
      expect(bundle.ifc).toBeNull();
    });

    it('loads a valid CI bundle', async () => {
      const spaces = buildMockSpaces({
        [ciKey]: JSON.stringify(ciBundleFixture),
      });
      const loader = new SpacesBundleLoader(spaces);
      const bundle = await loader.load('ci-baseline', '1.0.0');
      expect(bundle.bundle_type).toBe('CI');
    });

    it('PILOT bundle: pipeline_flags.voxelize is false', async () => {
      const spaces = buildMockSpaces({
        [pilotKey]: JSON.stringify(pilotBundleFixture),
      });
      const loader = new SpacesBundleLoader(spaces);
      const bundle = await loader.load('inca-boardline-alberta', '1.0.0');
      expect(bundle.pipeline_flags.voxelize).toBe(false);
    });

    it('DEMO bundle: pipeline_flags.voxelize is true', async () => {
      const spaces = buildMockSpaces({
        [demoKey]: JSON.stringify(demoBundleFixture),
      });
      const loader = new SpacesBundleLoader(spaces);
      const bundle = await loader.load('maple-ridge-commerce-centre', '1.0.0');
      expect(bundle.pipeline_flags.voxelize).toBe(true);
    });

    it('is idempotent — loading same bundle twice returns structurally equal objects', async () => {
      const spaces = buildMockSpaces({
        [demoKey]: JSON.stringify(demoBundleFixture),
      });
      const loader = new SpacesBundleLoader(spaces);
      const a = await loader.load('maple-ridge-commerce-centre', '1.0.0');
      const b = await loader.load('maple-ridge-commerce-centre', '1.0.0');
      expect(a).toEqual(b);
    });
  });

  describe('load() — error cases', () => {
    it('throws BundleNotFoundError when bundle_id does not exist', async () => {
      const spaces = buildMockSpaces({});
      const loader = new SpacesBundleLoader(spaces);
      await expect(loader.load('does-not-exist', '1.0.0'))
        .rejects.toBeInstanceOf(BundleNotFoundError);
    });

    it('throws BundleValidationError when bundle JSON is malformed', async () => {
      const spaces = buildMockSpaces({
        [demoKey]: 'NOT { valid json',
      });
      const loader = new SpacesBundleLoader(spaces);
      await expect(loader.load('maple-ridge-commerce-centre', '1.0.0'))
        .rejects.toBeInstanceOf(BundleValidationError);
    });

    it('throws BundleValidationError when bundle_type is unrecognised', async () => {
      const bad = { ...demoBundleFixture, bundle_type: 'UNKNOWN_TYPE' };
      const spaces = buildMockSpaces({ [demoKey]: JSON.stringify(bad) });
      const loader = new SpacesBundleLoader(spaces);
      await expect(loader.load('maple-ridge-commerce-centre', '1.0.0'))
        .rejects.toBeInstanceOf(BundleValidationError);
    });

    it('throws BundleValidationError when DEMO bundle has ifc=null', async () => {
      const bad = { ...demoBundleFixture, ifc: null };
      const spaces = buildMockSpaces({ [demoKey]: JSON.stringify(bad) });
      const loader = new SpacesBundleLoader(spaces);
      await expect(loader.load('maple-ridge-commerce-centre', '1.0.0'))
        .rejects.toBeInstanceOf(BundleValidationError);
    });

    it('throws SHA256MismatchError when IFC hash does not match', async () => {
      const bundleWithHash = {
        ...demoBundleFixture,
        ifc: {
          ...demoBundleFixture.ifc,
          files: [
            {
              discipline: 'ARC',
              filename: 'Ifc4_Revit_ARC.ifc',
              size_bytes: 100,
              sha256: 'expected-hash-abc123',
            },
          ],
        },
      };
      const spaces = buildMockSpaces({ [demoKey]: JSON.stringify(bundleWithHash) });
      (spaces.getSHA256 as ReturnType<typeof vi.fn>).mockResolvedValue('actual-hash-different');
      const loader = new SpacesBundleLoader(spaces);
      await expect(loader.load('maple-ridge-commerce-centre', '1.0.0'))
        .rejects.toBeInstanceOf(SHA256MismatchError);
    });
  });

  describe('listAvailable()', () => {
    it('returns entries for all bundle.json files found in Spaces', async () => {
      const spaces = buildMockSpaces({
        [demoKey]: JSON.stringify(demoBundleFixture),
        [pilotKey]: JSON.stringify(pilotBundleFixture),
      });
      const loader = new SpacesBundleLoader(spaces);
      const entries = await loader.listAvailable();
      expect(entries.length).toBe(2);
      expect(entries.map(e => e.bundle_id)).toContain('maple-ridge-commerce-centre');
      expect(entries.map(e => e.bundle_id)).toContain('inca-boardline-alberta');
    });

    it('returns an empty array when no bundles exist', async () => {
      const spaces = buildMockSpaces({});
      const loader = new SpacesBundleLoader(spaces);
      const entries = await loader.listAvailable();
      expect(entries).toEqual([]);
    });
  });
});
