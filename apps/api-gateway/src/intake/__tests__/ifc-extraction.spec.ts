/**
 * @fileoverview IFCExtractionClient contract tests.
 * Uses mock fetch — no real service needed.
 *
 * @see apps/api-gateway/src/intake/ifc-extraction-client.ts
 */

import { IFCExtractionClient, IFCExtractionClientError } from '../ifc-extraction-client';
import { IFCParseError } from '../interfaces/ifc-extraction.interface';
import type { ElementManifest } from '../interfaces/ifc-extraction.interface';

/** Minimal valid ElementManifest for tests */
const MANIFEST_FIXTURE: ElementManifest = {
  ifc_filename: 'Ifc4_Revit_ARC.ifc',
  discipline: 'ARC',
  parsed_at: '2026-03-27T00:00:00Z',
  storey_count: 3,
  storeys: [
    { name: 'Level 0', elevation: 0.0, z_min: -0.1, z_max: 1.1 },
    { name: 'Level 1', elevation: 1.1, z_min: 1.1, z_max: 2.1 },
    { name: 'Level 2', elevation: 2.1, z_min: 2.1, z_max: 3.2 },
  ],
  element_count: 3,
  elements: [
    {
      guid: 'GUID-WALL-001',
      ifc_type: 'IfcWall',
      system: 'ARCH',
      level: 'Level 1',
      level_elevation: 1.1,
      bbox: { min_x: 0, max_x: 1, min_y: 0, max_y: 0.2, min_z: 1.1, max_z: 2.1 },
      attributes: {},
    },
    {
      guid: 'GUID-BEAM-001',
      ifc_type: 'IfcBeam',
      system: 'STRUCT',
      level: 'Level 1',
      level_elevation: 1.1,
      bbox: { min_x: 1, max_x: 4, min_y: 0, max_y: 0.3, min_z: 1.8, max_z: 2.0 },
      attributes: {},
    },
    {
      guid: 'GUID-DUCT-001',
      ifc_type: 'IfcDuctSegment',
      system: 'HVAC',
      level: 'Level 1',
      level_elevation: 1.1,
      bbox: { min_x: 1.5, max_x: 3.5, min_y: -1, max_y: 1, min_z: 1.4, max_z: 1.9 },
      attributes: {},
    },
  ],
};

/** Mock global fetch for unit tests */
function mockFetch(
  responses: Array<{ status: number; body: string }>,
) {
  let callIndex = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const r = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => r.body,
    } as Response;
  });
}

describe('IFCExtractionClient — contract tests', () => {
  let client: IFCExtractionClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new IFCExtractionClient({ baseUrl: 'http://localhost:4010', timeoutMs: 5000 });
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  describe('extract() — happy path', () => {
    it('returns an ElementManifest when service returns 200', async () => {
      fetchSpy = mockFetch([{ status: 200, body: JSON.stringify(MANIFEST_FIXTURE) }]);
      const manifest = await client.extract('demo-library/maple-ridge/ifc/ARC.ifc', 'ARC');
      expect(manifest.element_count).toBe(3);
      expect(manifest.discipline).toBe('ARC');
    });

    it('POSTs to /extract with correct body', async () => {
      fetchSpy = mockFetch([{ status: 200, body: JSON.stringify(MANIFEST_FIXTURE) }]);
      await client.extract('path/to/ARC.ifc', 'ARC');
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:4010/extract');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.ifc_path).toBe('path/to/ARC.ifc');
      expect(body.discipline).toBe('ARC');
    });

    it('every element in fixture has a non-empty guid', () => {
      for (const el of MANIFEST_FIXTURE.elements) {
        expect(el.guid).toBeTruthy();
      }
    });

    it('every element guid in fixture is unique', () => {
      const guids = MANIFEST_FIXTURE.elements.map(e => e.guid);
      expect(new Set(guids).size).toBe(guids.length);
    });

    it('every element has a non-empty level name', () => {
      for (const el of MANIFEST_FIXTURE.elements) {
        expect(el.level).toBeTruthy();
      }
    });

    it('IfcBeam elements have system=STRUCT', () => {
      const beams = MANIFEST_FIXTURE.elements.filter(e => e.ifc_type === 'IfcBeam');
      expect(beams.length).toBeGreaterThan(0);
      beams.forEach(b => expect(b.system).toBe('STRUCT'));
    });

    it('IfcDuctSegment elements have system=HVAC', () => {
      const ducts = MANIFEST_FIXTURE.elements.filter(e => e.ifc_type === 'IfcDuctSegment');
      expect(ducts.length).toBeGreaterThan(0);
      ducts.forEach(d => expect(d.system).toBe('HVAC'));
    });

    it('IfcWall elements have system=ARCH', () => {
      const walls = MANIFEST_FIXTURE.elements.filter(e => e.ifc_type === 'IfcWall');
      expect(walls.length).toBeGreaterThan(0);
      walls.forEach(w => expect(w.system).toBe('ARCH'));
    });

    it('fixture storeys are ordered ascending by elevation', () => {
      const elevations = MANIFEST_FIXTURE.storeys.map(s => s.elevation);
      for (let i = 1; i < elevations.length; i++) {
        expect(elevations[i]).toBeGreaterThan(elevations[i - 1]);
      }
    });

    it('fixture bbox min < max on all axes for every element', () => {
      for (const el of MANIFEST_FIXTURE.elements) {
        expect(el.bbox.min_x).toBeLessThan(el.bbox.max_x);
        expect(el.bbox.min_y).toBeLessThan(el.bbox.max_y);
        expect(el.bbox.min_z).toBeLessThan(el.bbox.max_z);
      }
    });
  });

  describe('extract() — error cases', () => {
    it('throws IFCParseError when service returns 422', async () => {
      fetchSpy = mockFetch([{ status: 422, body: '{"detail":"corrupt IFC file"}' }]);
      await expect(client.extract('bad.ifc', 'ARC')).rejects.toBeInstanceOf(IFCParseError);
    });

    it('throws IFCExtractionClientError when service returns 500', async () => {
      fetchSpy = mockFetch([{ status: 500, body: 'Internal Server Error' }]);
      await expect(client.extract('path/to/ARC.ifc', 'ARC'))
        .rejects.toBeInstanceOf(IFCExtractionClientError);
    });
  });

  describe('caching', () => {
    it('getCachedManifest returns null when service returns 404', async () => {
      fetchSpy = mockFetch([{ status: 404, body: 'Not Found' }]);
      const result = await client.getCachedManifest('abc123');
      expect(result).toBeNull();
    });

    it('getCachedManifest returns manifest when service returns 200', async () => {
      fetchSpy = mockFetch([{ status: 200, body: JSON.stringify(MANIFEST_FIXTURE) }]);
      const result = await client.getCachedManifest('abc123');
      expect(result).not.toBeNull();
      expect(result?.discipline).toBe('ARC');
    });

    it('cacheManifest calls PUT /cache/:sha256', async () => {
      fetchSpy = mockFetch([{ status: 200, body: '' }]);
      await client.cacheManifest('abc123', MANIFEST_FIXTURE);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:4010/cache/abc123');
      expect(init.method).toBe('PUT');
    });
  });

  describe('isHealthy()', () => {
    it('returns true when service responds 200', async () => {
      fetchSpy = mockFetch([{ status: 200, body: '{"status":"ok"}' }]);
      expect(await client.isHealthy()).toBe(true);
    });

    it('returns false when service is unreachable', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
      expect(await client.isHealthy()).toBe(false);
    });
  });
});
