/**
 * @fileoverview Stage4IFCService — IFC ingestion and BOX voxelization.
 *
 * Reads processed ElementManifests from DO Spaces cache, converts IFC
 * elements into BoxElement format, runs the VoxelRasterizerService, and
 * bulk-inserts the resulting BOX cells into the voxels table.
 *
 * Flow:
 *   1. Check bundle.pipeline_flags.voxelize — skip if false
 *   2. For each discipline (ARC, MEP, STR): load cached manifest from Spaces
 *   3. Convert ElementManifest elements → BoxElement[] (metres → mm)
 *   4. Rasterize at COARSE resolution (100mm) via rasterizeElements()
 *   5. Delete existing voxels for this project (idempotent replace)
 *   6. Bulk insert new BOX cells via raw SQL (voxel_grid_id not in Prisma)
 *   7. Upsert voxel_grids record
 *   8. Upsert speckle_streams row with confirmed stream ID
 *   9. Set context.voxelGridId + context.elementManifests for downstream
 *
 * Coordinate convention:
 *   - Manifests store metres (from Speckle WorldTree)
 *   - Rasterizer operates in millimetres (metres × 1000)
 *   - DB stores metres (mm × 0.001 after rasterization)
 *
 * @module stage-4-ifc
 * @see DEC-009 — BOX Pipeline Architecture
 * @see extract-speckle-elements.py — manifest generator
 */

import { createHash } from 'crypto';
import type {
  IIntakeStage,
  IntakeContext,
  StageResult,
} from '../interfaces/intake-stage.interface';
import { IntakeStageError } from '../interfaces/intake-stage.interface';
import type { IntakeStageId, IFCDiscipline } from '../interfaces/bundle.types';
import type { ElementManifest, IFCElement } from '../interfaces/ifc-extraction.interface';
import { rasterizeElements, type BoxElement } from '../services/voxel-rasterizer.service';

/** Disciplines to process, in order. */
const DISCIPLINES: IFCDiscipline[] = ['ARC', 'MEP', 'STR'];

/** Metres to millimetres conversion factor. */
const M_TO_MM = 1000;

/** Millimetres to metres conversion factor. */
const MM_TO_M = 0.001;

/** Default rasterization resolution in mm (COARSE tier). */
const COARSE_RESOLUTION_MM = 100;

/**
 * Stage4IFCService — IFC ingestion and BOX voxelization stage.
 *
 * Loads pre-processed ElementManifests from DO Spaces, rasterizes IFC
 * bounding boxes into discrete BOX cells, and writes them to the database.
 */
export class Stage4IFCService implements IIntakeStage {
  readonly stageId: IntakeStageId = 'IFC_INGESTION';
  readonly stageName = 'IFC Ingestion and Voxelization';

  /** @inheritdoc */
  async execute(context: IntakeContext): Promise<StageResult> {
    const start = Date.now();
    const { bundle, db, spaces, log } = context;

    // ── Guard: voxelize flag ────────────────────────────────────────────
    if (!bundle.pipeline_flags.voxelize) {
      log.info(this.stageId, 'voxelize=false — skipping IFC ingestion');
      return {
        stageId: this.stageId,
        success: true,
        rowsAffected: 0,
        durationMs: Date.now() - start,
        idempotencyKey: 'skipped',
        warnings: ['voxelize=false — no voxels generated'],
      };
    }

    // ── Guard: projectId required ───────────────────────────────────────
    if (!context.projectId) {
      throw new IntakeStageError(
        this.stageId,
        'context.projectId must be set before Stage 4',
      );
    }

    // ── Guard: IFC config required ──────────────────────────────────────
    if (!bundle.ifc) {
      throw new IntakeStageError(
        this.stageId,
        'bundle.ifc is required when voxelize=true',
      );
    }

    const projectId = context.projectId;
    const ifc = bundle.ifc;
    const bundleAny = bundle as any;
    const manifestCache: Record<string, string> = bundleAny.manifest_cache ?? {};
    const speckleObjects: Record<string, string> = (ifc as any).speckle_objects ?? {};
    const streamId = ifc.speckle_stream_id ?? '';
    const spacesClient = spaces as any;
    const prisma = db as any;

    // ── 1. Load manifests from Spaces cache ─────────────────────────────
    const manifests: ElementManifest[] = [];
    let totalElements = 0;

    for (const disc of DISCIPLINES) {
      const cacheKey = manifestCache[disc];
      if (!cacheKey) {
        log.warn(this.stageId, `No manifest_cache path for ${disc} — skipping discipline`);
        continue;
      }

      log.info(this.stageId, `Loading manifest: ${cacheKey}`);
      let raw: string;
      try {
        raw = await spacesClient.getText(cacheKey);
      } catch (err) {
        throw new IntakeStageError(
          this.stageId,
          `Failed to load cached manifest for ${disc} from '${cacheKey}'. ` +
          `Run extract-speckle-elements.py and upload to Spaces first.`,
          err,
        );
      }

      const manifest: ElementManifest = JSON.parse(raw);
      manifests.push(manifest);
      totalElements += manifest.element_count;
      log.info(this.stageId, `${disc}: ${manifest.element_count} elements, ${manifest.storey_count} storeys`);
    }

    if (totalElements === 0) {
      log.warn(this.stageId, 'No IFC elements found in any manifest');
      return {
        stageId: this.stageId,
        success: true,
        rowsAffected: 0,
        durationMs: Date.now() - start,
        idempotencyKey: 'empty',
        warnings: ['No IFC elements in manifests'],
      };
    }

    context.elementManifests = manifests;

    // ── 2. Convert manifest elements → BoxElement[] (m → mm) ────────────
    const boxElements: BoxElement[] = [];
    for (const manifest of manifests) {
      for (const el of manifest.elements) {
        boxElements.push(manifestElementToBoxElement(el));
      }
    }

    log.info(this.stageId, `Converted ${boxElements.length} elements to BoxElement format`);

    // ── 3. Rasterize ────────────────────────────────────────────────────
    const resolutionMm = (ifc.voxelization?.resolution_m ?? 0.1) * M_TO_MM;
    log.info(this.stageId, `Rasterizing at ${resolutionMm}mm resolution...`);
    const result = rasterizeElements(boxElements, resolutionMm);
    const voxelCount = result.voxels.length;
    log.info(this.stageId, `Rasterization complete: ${voxelCount} BOX cells`);

    if (voxelCount === 0) {
      throw new IntakeStageError(
        this.stageId,
        `Rasterizer produced 0 voxels from ${boxElements.length} elements`,
      );
    }

    // ── 4. Delete existing voxels (idempotent replace) ──────────────────
    log.info(this.stageId, 'Deleting existing voxels for project...');
    const deleteResult = await prisma.voxel.deleteMany({
      where: { project_id: projectId },
    });
    log.info(this.stageId, `Deleted ${deleteResult.count} existing voxels`);

    // ── 5. Upsert voxel_grids record (raw SQL — not in Prisma) ──────────
    const arcObject = speckleObjects['ARC'] ?? '';
    const vs = result.voxels;

    const bboxMinX = Math.min(...vs.map(v => v.bounds.min.x)) * MM_TO_M;
    const bboxMaxX = Math.max(...vs.map(v => v.bounds.max.x)) * MM_TO_M;
    const bboxMinY = Math.min(...vs.map(v => v.bounds.min.y)) * MM_TO_M;
    const bboxMaxY = Math.max(...vs.map(v => v.bounds.max.y)) * MM_TO_M;
    const bboxMinZ = Math.min(...vs.map(v => v.bounds.min.z)) * MM_TO_M;
    const bboxMaxZ = Math.max(...vs.map(v => v.bounds.max.z)) * MM_TO_M;

    // Delete existing grid records for this project (idempotent)
    await prisma.$executeRawUnsafe(
      `DELETE FROM voxel_grids WHERE project_id = $1::uuid`,
      projectId,
    );

    const gridRows: any[] = await prisma.$queryRawUnsafe(`
      INSERT INTO voxel_grids
        (id, project_id, stream_id, object_id, resolution, resolution_tier,
         source_type, status, voxel_count,
         bbox_min_x, bbox_max_x, bbox_min_y, bbox_max_y, bbox_min_z, bbox_max_z,
         generated_at, created_at, updated_at)
      VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, 'COARSE', 'BIM', 'COMPLETE', $5,
              $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW())
      RETURNING id
    `,
      projectId, streamId, arcObject, resolutionMm * MM_TO_M, voxelCount,
      bboxMinX, bboxMaxX, bboxMinY, bboxMaxY, bboxMinZ, bboxMaxZ,
    );

    const gridId = gridRows[0]?.id ?? null;
    context.voxelGridId = gridId;
    log.info(this.stageId, `voxel_grids upserted: gridId=${gridId}`);

    // ── 6. Bulk insert new BOX cells (raw SQL for voxel_grid_id) ────────
    log.info(this.stageId, `Inserting ${voxelCount} voxels in chunks...`);
    const CHUNK = 100;
    for (let i = 0; i < vs.length; i += CHUNK) {
      const chunk = vs.slice(i, i + CHUNK);
      const vals: any[] = [];
      const placeholders = chunk.map((v, j) => {
        const b = j * 18 + 1;
        const ifcArr = `{${(v.ifcElements ?? []).join(',')}}`;
        const voxelId = `VOX-BOX-${String(i + j).padStart(5, '0')}`;
        const urn = `urn:ectropy:${projectId}:voxel:${voxelId}`;
        vals.push(
          urn, voxelId,
          projectId, gridId, null,
          v.center.x * MM_TO_M, v.center.y * MM_TO_M, v.center.z * MM_TO_M,
          v.bounds.min.x * MM_TO_M, v.bounds.max.x * MM_TO_M,
          v.bounds.min.y * MM_TO_M, v.bounds.max.y * MM_TO_M,
          v.bounds.min.z * MM_TO_M, v.bounds.max.z * MM_TO_M,
          resolutionMm * MM_TO_M,
          v.system ?? 'UNKNOWN',
          v.level ?? 'Unknown',
          ifcArr,
        );
        return `(gen_random_uuid(),$${b},$${b+1},$${b+2}::uuid,$${b+3}::uuid,$${b+4}::uuid,$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},'PLANNED','HEALTHY',$${b+15},$${b+16},$${b+17}::text[])`;
      });
      await prisma.$executeRawUnsafe(
        `INSERT INTO voxels
           (id, urn, voxel_id,
            project_id, voxel_grid_id, parent_voxel_id,
            coord_x, coord_y, coord_z,
            min_x, max_x, min_y, max_y, min_z, max_z,
            resolution, status, health_status, system, level, ifc_elements)
         VALUES ${placeholders.join(',')}`,
        ...vals,
      );
    }

    log.info(this.stageId, `Inserted ${voxelCount} voxels`);

    // ── 7. Upsert speckle_streams row ───────────────────────────────────
    // stream_id has @unique — may already be claimed by another project.
    // Use raw SQL upsert on stream_id to handle both cases.
    if (streamId) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO speckle_streams (id, construction_project_id, stream_id, stream_name, created_at, updated_at)
        VALUES (gen_random_uuid(), $1::uuid, $2, $3, NOW(), NOW())
        ON CONFLICT (stream_id) DO UPDATE SET
          construction_project_id = EXCLUDED.construction_project_id,
          stream_name = EXCLUDED.stream_name,
          updated_at = NOW()
      `, projectId, streamId, `${bundle.project.name} — Full IFC Model`);
      log.info(this.stageId, `speckle_streams upserted: stream_id=${streamId}`);
    }

    // ── 8. Compute idempotency key ──────────────────────────────────────
    const idempotencyKey = createHash('sha256')
      .update(`${projectId}:${voxelCount}:${streamId}`)
      .digest('hex')
      .slice(0, 16);

    return {
      stageId: this.stageId,
      success: true,
      rowsAffected: voxelCount,
      durationMs: Date.now() - start,
      idempotencyKey,
      warnings: [],
    };
  }
}

/**
 * Converts an IFCElement from the manifest format to BoxElement format
 * for the rasterizer. Scales coordinates from metres to millimetres.
 *
 * @param el - IFCElement with bbox in metres
 * @returns BoxElement with boundingBox in millimetres
 */
function manifestElementToBoxElement(el: IFCElement): BoxElement {
  return {
    globalId: el.guid,
    type: el.ifc_type,
    containedInStorey: el.level,
    boundingBox: {
      min: {
        x: el.bbox.min_x * M_TO_MM,
        y: el.bbox.min_y * M_TO_MM,
        z: el.bbox.min_z * M_TO_MM,
      },
      max: {
        x: el.bbox.max_x * M_TO_MM,
        y: el.bbox.max_y * M_TO_MM,
        z: el.bbox.max_z * M_TO_MM,
      },
    },
  };
}
