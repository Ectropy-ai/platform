#!/usr/bin/env python3
"""
SpeckleElementExtractor — walks Speckle WorldTree and computes
element bboxes from mesh vertices using storey-closure strategy.

Strategy: download full closure per root (1 streaming request per discipline).
The /objects/{stream}/{id}/single endpoint returns the root object with
__closure containing all descendant IDs. We index all objects, then walk
storey.elements[] to assign levels.

Confirmed field names from ground truth (2026-03-27):
    ifcType             — IFC entity type (IfcWall, IfcDuctSegment, etc.)
    applicationId       — IFC GlobalId
    displayValue[0].referencedId → mesh object
    mesh.vertices[0].referencedId → vertex DataChunk
    chunk.data          → flat float array [x0,y0,z0, x1,y1,z1, ...]
    storey.elements[]   — child element references
    mesh.units          — "m" (metres, confirmed)

Usage:
    python3 extract-speckle-elements.py \\
        --token <speckle-token> \\
        --url http://localhost:3100 \\
        --stream 8887bf8651 \\
        --root <root-object-id> \\
        --discipline ARC \\
        --output /tmp/ARC-manifest.json
"""

import argparse
import json
import math
import sys
import time
import urllib.request
from datetime import datetime, timezone

# ── System type classification ────────────────────────────────────

IFC_TYPE_TO_SYSTEM = {
    'IfcWall': 'ARCH', 'IfcWallStandardCase': 'ARCH',
    'IfcSlab': 'ARCH', 'IfcRoof': 'ARCH',
    'IfcDoor': 'ARCH', 'IfcWindow': 'ARCH',
    'IfcStair': 'ARCH', 'IfcStairFlight': 'ARCH',
    'IfcRailing': 'ARCH', 'IfcCovering': 'ARCH',
    'IfcCurtainWall': 'ARCH', 'IfcPlate': 'ARCH',
    'IfcMember': 'ARCH', 'IfcFurniture': 'ARCH',
    'IfcBuildingElementProxy': 'ARCH',
    'IfcBeam': 'STRUCT', 'IfcColumn': 'STRUCT',
    'IfcFoundation': 'STRUCT', 'IfcPile': 'STRUCT',
    'IfcFooting': 'STRUCT',
    'IfcReinforcingBar': 'STRUCT', 'IfcReinforcingMesh': 'STRUCT',
    'IfcDuctSegment': 'HVAC', 'IfcDuctFitting': 'HVAC',
    'IfcAirTerminal': 'HVAC', 'IfcAirTerminalBox': 'HVAC',
    'IfcUnitaryEquipment': 'HVAC', 'IfcCoil': 'HVAC',
    'IfcFan': 'HVAC', 'IfcFilter': 'HVAC', 'IfcDamper': 'HVAC',
    'IfcFlowController': 'HVAC',
    'IfcPipeSegment': 'PLUMB', 'IfcPipeFitting': 'PLUMB',
    'IfcValve': 'PLUMB', 'IfcSanitaryTerminal': 'PLUMB',
    'IfcFireSuppression': 'PLUMB', 'IfcFlowTerminal': 'PLUMB',
    'IfcCableCarrierSegment': 'ELEC', 'IfcCableSegment': 'ELEC',
    'IfcElectricAppliance': 'ELEC', 'IfcLightFixture': 'ELEC',
    'IfcElectricDistributionBoard': 'ELEC',
    'IfcProtectiveDevice': 'ELEC', 'IfcJunctionBox': 'ELEC',
}


def classify_system(ifc_type):
    if not ifc_type:
        return 'UNKNOWN'
    result = IFC_TYPE_TO_SYSTEM.get(ifc_type)
    if result:
        return result
    for prefix, system in [
        ('IfcWall', 'ARCH'), ('IfcSlab', 'ARCH'), ('IfcRoof', 'ARCH'),
        ('IfcBeam', 'STRUCT'), ('IfcColumn', 'STRUCT'),
        ('IfcReinforc', 'STRUCT'),
        ('IfcDuct', 'HVAC'), ('IfcAir', 'HVAC'),
        ('IfcPipe', 'PLUMB'), ('IfcSanitary', 'PLUMB'),
        ('IfcCable', 'ELEC'), ('IfcLight', 'ELEC'),
    ]:
        if ifc_type.startswith(prefix):
            return system
    return 'UNKNOWN'


# ── Speckle API ───────────────────────────────────────────────────

def fetch_single(base_url, stream, obj_id, token):
    url = '%s/objects/%s/%s/single' % (base_url, stream, obj_id)
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode('utf-8'))


def fetch_batch(base_url, stream, ids, token):
    """Fetch multiple objects using getobjects API (returns id\\tjson lines)."""
    url = '%s/api/getobjects/%s' % (base_url, stream)
    body = json.dumps({'objects': json.dumps(ids)}).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip',
        },
        method='POST',
    )
    import gzip
    objects = {}
    with urllib.request.urlopen(req, timeout=300) as resp:
        raw = resp.read()
        try:
            raw = gzip.decompress(raw)
        except Exception:
            pass
        text = raw.decode('utf-8', errors='ignore')
        # Response is a JSON array of objects
        try:
            arr = json.loads(text)
            if isinstance(arr, list):
                for obj in arr:
                    if isinstance(obj, dict):
                        oid = obj.get('id', '')
                        if oid:
                            objects[oid] = obj
        except json.JSONDecodeError:
            # Fallback: try tab-separated NDJSON
            for line in text.split('\n'):
                line = line.strip()
                if not line:
                    continue
                parts = line.split('\t', 1)
                payload = parts[1] if len(parts) >= 2 else parts[0]
                try:
                    obj = json.loads(payload)
                    oid = obj.get('id', '')
                    if oid:
                        objects[oid] = obj
                except Exception:
                    pass
    return objects


# ── Bbox computation ──────────────────────────────────────────────

def compute_bbox(element_id, obj_index):
    """
    element → displayValue[0].referencedId → mesh
    mesh → vertices[0].referencedId → DataChunk
    DataChunk.data → [x0,y0,z0, x1,y1,z1, ...]
    Returns {min_x, max_x, min_y, max_y, min_z, max_z} or None.
    """
    element = obj_index.get(element_id)
    if not element:
        return None

    dv = element.get('displayValue', element.get('@displayValue', []))
    if not dv or not isinstance(dv, list):
        return None

    all_xs, all_ys, all_zs = [], [], []

    for dv_item in dv:
        mesh = None
        if isinstance(dv_item, dict):
            ref_id = dv_item.get('referencedId')
            if ref_id:
                mesh = obj_index.get(ref_id)
            else:
                mesh = dv_item
        if not mesh:
            continue

        verts = mesh.get('vertices', mesh.get('@vertices'))
        if not verts:
            continue

        if isinstance(verts, list):
            for vr in verts:
                chunk = None
                if isinstance(vr, dict):
                    cid = vr.get('referencedId')
                    if cid:
                        chunk = obj_index.get(cid)
                    else:
                        chunk = vr
                if not chunk:
                    continue
                data = chunk.get('data', [])
                if isinstance(data, list) and len(data) >= 3:
                    all_xs.extend(data[0::3])
                    all_ys.extend(data[1::3])
                    all_zs.extend(data[2::3])

    if not all_xs:
        return None

    return {
        'min_x': min(all_xs), 'max_x': max(all_xs),
        'min_y': min(all_ys), 'max_y': max(all_ys),
        'min_z': min(all_zs), 'max_z': max(all_zs),
    }


# ── Main extraction ───────────────────────────────────────────────

def extract_discipline(base_url, stream, root_id, token, discipline,
                       arc_storeys_for_str=None):
    log = lambda msg: print('[%s] %s' % (discipline, msg), file=sys.stderr)

    log('Fetching root object...')
    root = fetch_single(base_url, stream, root_id, token)
    closure = root.get('__closure', {})
    all_ids = list(closure.keys())
    log('Closure: %d objects' % len(all_ids))

    # Fetch all objects in batches
    log('Downloading all objects in batches of 200...')
    obj_index = {}
    # Include root itself
    obj_index[root.get('id', root_id)] = root

    start = time.time()
    batch_size = 200
    for i in range(0, len(all_ids), batch_size):
        batch = all_ids[i:i + batch_size]
        batch_objs = fetch_batch(base_url, stream, batch, token)
        obj_index.update(batch_objs)
        if (i // batch_size) % 10 == 0:
            log('  fetched %d / %d objects...' % (min(i + batch_size, len(all_ids)), len(all_ids)))

    elapsed = time.time() - start
    log('Downloaded %d objects in %.1fs' % (len(obj_index), elapsed))

    # Find storeys
    storeys = []
    for obj in obj_index.values():
        ifc_t = obj.get('ifcType', '')
        if ifc_t == 'IfcBuildingStorey':
            storeys.append(obj)

    log('Found %d storeys' % len(storeys))

    # Build storey records
    storey_records = []
    for s in storeys:
        name = s.get('name', s.get('Name', 'Unknown'))
        elev = None
        props = s.get('properties', {})
        if isinstance(props, dict):
            attrs = props.get('Attributes', {})
            if isinstance(attrs, dict):
                elev = attrs.get('Elevation')
        if elev is None:
            elev = s.get('elevation', s.get('Elevation', 0.0))
        try:
            elev = float(elev) if elev is not None else 0.0
        except (TypeError, ValueError):
            elev = 0.0

        elem_ids = []
        elements_ref = s.get('elements', s.get('@elements', []))
        if isinstance(elements_ref, list):
            for ref in elements_ref:
                if isinstance(ref, dict):
                    rid = ref.get('referencedId')
                    if rid:
                        elem_ids.append(rid)
                elif isinstance(ref, str):
                    elem_ids.append(ref)

        storey_records.append({
            'id': s.get('id', ''),
            'name': name,
            'elevation': round(elev, 4),
            'element_ids': elem_ids,
        })

    storey_records.sort(key=lambda x: x['elevation'])

    is_no_storey = (len(storeys) == 0)

    # Extract elements
    elements = []
    skipped_no_bbox = 0
    skipped_no_type = 0

    if not is_no_storey:
        for storey in storey_records:
            level_name = storey['name']
            level_elev = storey['elevation']
            log('Processing storey "%s" (%d elements)...' % (
                level_name, len(storey['element_ids'])))

            for eid in storey['element_ids']:
                elem = obj_index.get(eid)
                if not elem:
                    continue
                ifc_type = elem.get('ifcType', '')
                if not ifc_type or 'Type' in ifc_type[-4:]:
                    skipped_no_type += 1
                    continue
                guid = elem.get('applicationId', '')
                name = elem.get('name', '')

                bbox = compute_bbox(eid, obj_index)
                if not bbox:
                    skipped_no_bbox += 1
                    continue

                elements.append({
                    'guid': guid,
                    'ifc_type': ifc_type,
                    'system': classify_system(ifc_type),
                    'level': level_name,
                    'level_elevation': level_elev,
                    'bbox': {k: round(v, 4) for k, v in bbox.items()},
                    'attributes': {'name': name},
                })
    else:
        # No storeys — infer level from z proximity to ARC storeys
        arc_elev_map = []
        if arc_storeys_for_str:
            for s in arc_storeys_for_str:
                arc_elev_map.append((s['elevation'], s['name']))
            arc_elev_map.sort()

        def infer_level(z_min):
            if not arc_elev_map:
                return ('Unknown', 0.0)
            best_name, best_elev = arc_elev_map[0][1], arc_elev_map[0][0]
            for elev, name in arc_elev_map:
                if elev <= z_min:
                    best_name, best_elev = name, elev
                else:
                    break
            return (best_name, best_elev)

        log('No storeys — inferring levels from z-coordinate...')
        for obj in obj_index.values():
            ifc_type = obj.get('ifcType', '')
            if not ifc_type or 'Type' in ifc_type[-4:]:
                continue
            if classify_system(ifc_type) == 'UNKNOWN':
                continue
            eid = obj.get('id', '')
            guid = obj.get('applicationId', '')
            name = obj.get('name', '')

            bbox = compute_bbox(eid, obj_index)
            if not bbox:
                skipped_no_bbox += 1
                continue

            level_name, level_elev = infer_level(bbox['min_z'])
            elements.append({
                'guid': guid,
                'ifc_type': ifc_type,
                'system': classify_system(ifc_type),
                'level': level_name,
                'level_elevation': level_elev,
                'bbox': {k: round(v, 4) for k, v in bbox.items()},
                'attributes': {'name': name},
            })

    log('Extracted %d elements (skipped: %d no-bbox, %d no-type)' % (
        len(elements), skipped_no_bbox, skipped_no_type))

    # Compute storey z ranges from elements
    storey_z = {}
    for e in elements:
        lvl = e['level']
        z_min = e['bbox']['min_z']
        z_max = e['bbox']['max_z']
        if lvl not in storey_z:
            storey_z[lvl] = {'z_min': z_min, 'z_max': z_max, 'elev': e['level_elevation']}
        else:
            storey_z[lvl]['z_min'] = min(storey_z[lvl]['z_min'], z_min)
            storey_z[lvl]['z_max'] = max(storey_z[lvl]['z_max'], z_max)

    final_storeys = [
        {'name': n, 'elevation': d['elev'],
         'z_min': round(d['z_min'], 4), 'z_max': round(d['z_max'], 4)}
        for n, d in storey_z.items()
    ]
    final_storeys.sort(key=lambda x: x['elevation'])

    return {
        'ifc_filename': 'Ifc4_Revit_%s.ifc' % discipline,
        'discipline': discipline,
        'parsed_at': datetime.now(timezone.utc).isoformat(),
        'storey_count': len(final_storeys),
        'storeys': final_storeys,
        'element_count': len(elements),
        'elements': elements,
    }


def main():
    parser = argparse.ArgumentParser(description='SpeckleElementExtractor')
    parser.add_argument('--token', required=True)
    parser.add_argument('--url', required=True)
    parser.add_argument('--stream', required=True)
    parser.add_argument('--root', required=True)
    parser.add_argument('--discipline', required=True, choices=['ARC', 'MEP', 'STR'])
    parser.add_argument('--output', required=True)
    parser.add_argument('--arc-storeys-file',
                        help='ARC manifest JSON for STR level inference')
    args = parser.parse_args()

    arc_storeys = None
    if args.arc_storeys_file:
        with open(args.arc_storeys_file) as f:
            arc_storeys = json.load(f).get('storeys', [])

    manifest = extract_discipline(
        base_url=args.url,
        stream=args.stream,
        root_id=args.root,
        token=args.token,
        discipline=args.discipline,
        arc_storeys_for_str=arc_storeys,
    )

    with open(args.output, 'w') as f:
        json.dump(manifest, f, indent=2)

    log = lambda msg: print('[%s] %s' % (args.discipline, msg), file=sys.stderr)
    log('Written to %s' % args.output)
    log('Elements: %d' % manifest['element_count'])
    log('Storeys: %d' % manifest['storey_count'])


if __name__ == '__main__':
    main()
