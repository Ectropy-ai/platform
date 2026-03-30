/**
 * @fileoverview TaktSchedule type definitions — the machine-readable
 * takt zone definitions loaded from bundle.takt_ref.
 *
 * Zone specificity rule: zones with narrower coordinate bounds are
 * applied LAST, overriding broader zones that overlap the same cells.
 * This is how the BLOCKED clash cluster overrides the IN_PROGRESS
 * zone that contains it.
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part IV
 */

export type VoxelStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'BLOCKED'
  | 'ON_HOLD'
  | 'INSPECTION_REQUIRED';

export interface CoordRange {
  min: number;
  max: number;
}

export interface TaktZoneDef {
  zone_id: string;
  name: string;
  takt_week: number;
  status: VoxelStatus;
  percent_complete: number;
  /** Primary spatial filter. Null when level_names is used instead. */
  z_range: CoordRange | null;
  x_range: CoordRange | null;
  y_range: CoordRange | null;
  /**
   * When set, used as primary WHERE filter: level IN (...).
   * z_range/x_range/y_range then act as optional sub-range refinements.
   * Takes precedence over z_range as the primary discriminator.
   */
  level_names?: string[];
  planned_start?: string;
  actual_start?: string;
  planned_end?: string;
  actual_end?: string;
  blocking_decision_ref?: string;
  trades?: string[];
  predecessor_zones?: string[];
}

export interface TaktSchedule {
  project_id_ref: string;
  takt_cycle_weeks: number;
  schema_version?: string;
  coordinate_space?: string;
  _note?: string;
  zones: TaktZoneDef[];
}

/**
 * Compute a specificity score for a zone.
 * More constrained bounds = higher score = applied later.
 */
export function zoneSpecificity(zone: TaktZoneDef): number {
  let score = 0;
  // Each active constraint adds to specificity score
  if (zone.level_names && zone.level_names.length > 0) score++;
  if (zone.z_range !== null) score++;
  if (zone.x_range !== null) score++;
  if (zone.y_range !== null) score++;
  // Volume inversely contributes: smaller volume = higher specificity
  const zSpan = zone.z_range ? zone.z_range.max - zone.z_range.min : 1000;
  const xSpan = zone.x_range ? zone.x_range.max - zone.x_range.min : 1000;
  const ySpan = zone.y_range ? zone.y_range.max - zone.y_range.min : 1000;
  const volume = zSpan * xSpan * ySpan;
  return score + (1 / (volume + 0.001));
}

/**
 * Sort zones from least specific to most specific.
 * Least specific applied first; most specific applied last (wins).
 */
export function sortZonesBySpecificity(zones: TaktZoneDef[]): TaktZoneDef[] {
  return [...zones].sort((a, b) => zoneSpecificity(a) - zoneSpecificity(b));
}
