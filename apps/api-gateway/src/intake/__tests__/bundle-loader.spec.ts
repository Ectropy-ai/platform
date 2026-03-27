/**
 * @fileoverview BundleLoader interface contract tests.
 * All tests are PENDING stubs. Implementation fills them green.
 *
 * @see apps/api-gateway/src/intake/interfaces/bundle-loader.interface.ts
 */

import type { IBundleLoader } from '../interfaces';

describe('BundleLoader — contract tests', () => {
  let loader: IBundleLoader;

  beforeEach(() => {
    // TODO: inject SpacesBundleLoader with mock Spaces client
    loader = {} as IBundleLoader;
  });

  describe('load()', () => {
    it.todo('loads a valid DEMO bundle and returns a typed IntakeBundle');
    it.todo('loads a valid PILOT bundle with ifc=null');
    it.todo('loads a valid CI bundle');
    it.todo('throws BundleNotFoundError when bundle_id does not exist');
    it.todo('throws BundleValidationError when bundle JSON is malformed');
    it.todo('throws BundleValidationError when a required ref file is absent from Spaces');
    it.todo('throws SHA256MismatchError when IFC file hash does not match bundle.json');
    it.todo('PILOT bundle: pipeline_flags.voxelize is false');
    it.todo('DEMO bundle: pipeline_flags.voxelize is true');
    it.todo('is idempotent — loading the same bundle twice returns structurally equal objects');
  });

  describe('listAvailable()', () => {
    it.todo('returns at least one entry when bundles exist in Spaces');
    it.todo('returns an empty array when no bundles exist');
  });
});
