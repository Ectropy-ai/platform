/**
 * @fileoverview IIFCExtractionService — local service contract + error class.
 * Data-shape types (BBox3D, StoreyRecord, IFCElement, ElementManifest) live
 * in @ectropy/schemas per F-2 schema extraction (2026-04-18).
 *
 * Contract guarantees:
 *   - All elements have a non-empty guid
 *   - All elements have a SystemType value (never null)
 *   - All elements have a level name (never null, never empty string)
 *   - bbox: min values strictly less than max values on all axes
 *   - GUIDs are unique within a single manifest
 *   - storeys are ordered ascending by elevation
 *   - Manifests are cached by IFC file SHA256 to avoid redundant parsing
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part III
 * @see BOX-ARCHITECTURE-2026-03-26.docx — Section 2.2 BIM Fields
 * @see ectropy-ai/schemas/types/ifc-extraction.types.ts
 */

import type { IFCDiscipline } from './bundle.types';

// Re-export the data-shape types for backward compatibility with existing consumers
export type {
  BBox3D,
  StoreyRecord,
  IFCElement,
  ElementManifest,
} from '@ectropy/schemas/types/ifc-extraction';

// Service contract — stays in platform (not a data shape, not a schema concern)
import type { ElementManifest } from '@ectropy/schemas/types/ifc-extraction';

export interface IIFCExtractionService {
  /**
   * Parse an IFC file and return a structured ElementManifest.
   * Checks cache first; parses only if no cached manifest for sha256.
   * @throws {IFCParseError} for corrupt, empty, or unsupported IFC files
   */
  extract(ifcPath: string, discipline: IFCDiscipline): Promise<ElementManifest>;

  /** Return cached manifest for sha256, or null if not cached. */
  getCachedManifest(sha256: string): Promise<ElementManifest | null>;

  /** Write manifest to cache keyed by sha256. */
  cacheManifest(sha256: string, manifest: ElementManifest): Promise<void>;
}

// Error class — stays in platform (runtime class, not a data shape)
export class IFCParseError extends Error {
  constructor(
    public readonly ifcPath: string,
    public readonly reason: string,
  ) {
    super(`IFC parse failed for '${ifcPath}': ${reason}`);
    this.name = 'IFCParseError';
  }
}
