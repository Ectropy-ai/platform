/**
 * @fileoverview IFCExtractionService interface contract tests.
 * Uses synthetic fixture IFC file — not the 13-28MB production files.
 *
 * @see apps/api-gateway/src/intake/interfaces/ifc-extraction.interface.ts
 * @see BOX-ARCHITECTURE-2026-03-26.docx — Section 2.2 BIM Fields
 */

import type { IIFCExtractionService } from '../interfaces';

describe('IFCExtractionService — contract tests', () => {
  let service: IIFCExtractionService;
  const FIXTURE_IFC = './fixtures/ifc/sample-arc.ifc';

  beforeEach(() => {
    // TODO: inject IFCExtractionService with mock cache client
    service = {} as IIFCExtractionService;
  });

  describe('extract()', () => {
    it.todo('returns an ElementManifest with element_count > 0 for a valid IFC');
    it.todo('every element has a non-empty guid');
    it.todo('every element guid is unique within the manifest');
    it.todo('every element has a non-empty level name — never null or empty string');
    it.todo('every element has a valid SystemType value — never null');
    it.todo('IfcBeam elements are classified as system=STRUCT');
    it.todo('IfcDuctSegment elements are classified as system=HVAC');
    it.todo('IfcWall elements are classified as system=ARCH');
    it.todo('IfcColumn elements are classified as system=STRUCT');
    it.todo('bbox.min_x < bbox.max_x for every element');
    it.todo('bbox.min_y < bbox.max_y for every element');
    it.todo('bbox.min_z < bbox.max_z for every element');
    it.todo('storeys are ordered ascending by elevation');
    it.todo('discipline field on manifest matches the discipline argument');
    it.todo('throws IFCParseError for a corrupt IFC file');
    it.todo('throws IFCParseError for an empty file');
  });

  describe('caching', () => {
    it.todo('getCachedManifest returns null when no manifest cached for sha256');
    it.todo('getCachedManifest returns manifest after cacheManifest called');
    it.todo('second extract() call for same sha256 returns cached manifest without parsing');
  });
});
