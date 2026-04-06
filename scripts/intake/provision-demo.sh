#!/usr/bin/env bash
# ============================================================================
# DEC-020: Server-side IFC → Speckle provisioning + BOX snapshot management
# BOX generation: fires via onViewerReady on first viewer load
# Server-side BOX generation: DEC-021 (post-demo — @speckle/objectloader)
# Decision linking: deferred — run link-decisions.sh post-BOX-generation
#
# Usage:
#   ./scripts/intake/provision-demo.sh setup   — full IFC → Speckle setup
#   ./scripts/intake/provision-demo.sh load    — fast restore from snapshot (<60s)
#   ./scripts/intake/provision-demo.sh export  — export BOX snapshot to Spaces
#
# Required environment variables:
#   STAGING_URL           - e.g. https://staging.ectropy.ai
#   PROJECT_ID            - Ectropy project UUID
#   SPECKLE_TOKEN         - Speckle service token (BW 05e6d74b)
#   SPECKLE_SERVER_URL    - Speckle GraphQL URL
#   SPACES_ACCESS_KEY     - DO Spaces access key
#   SPACES_SECRET_KEY     - DO Spaces secret key
#   DATABASE_URL          - Ectropy managed PostgreSQL (for load/export modes)
#
# Enterprise Excellence. Schema-First. No Shortcuts.
# ============================================================================

set -euo pipefail

SCRIPT_START=$(date +%s)
MODE="${1:-setup}"

# ============================================================================
# SHARED CONFIGURATION
# ============================================================================

SPACES_BUCKET="ectropy-staging-configs"
SPACES_REGION="sfo3"
IFC_BASE_PATH="demo-library/maple-ridge/ifc"
SEED_BASE_PATH="demo-library/maple-ridge/seed"
VOXELS_CACHE_KEY="${SEED_BASE_PATH}/voxels-cache.json"
DECISIONS_KEY="${SEED_BASE_PATH}/decisions.json"
SEPPA_CONTEXT_KEY="${SEED_BASE_PATH}/seppa-context.json"

DISCIPLINES=("ARC" "STR" "MEP")
declare -A IFC_FILES=(
  ["ARC"]="Ifc4_Revit_ARC.ifc"
  ["STR"]="Ifc4_Revit_STR.ifc"
  ["MEP"]="Ifc4_Revit_MEP.ifc"
)

# ============================================================================
# SHARED: VALIDATE COMMON INPUTS
# ============================================================================

validate_common() {
  local REQUIRED=("$@")
  local MISSING=()
  for var in "${REQUIRED[@]}"; do
    if [ -z "${!var:-}" ]; then
      MISSING+=("$var")
    fi
  done
  if [ ${#MISSING[@]} -gt 0 ]; then
    echo "❌ FATAL: Missing required environment variables:"
    printf '   - %s\n' "${MISSING[@]}"
    exit 1
  fi
}

# ============================================================================
# SHARED: SPACES CLIENT (boto3)
# ============================================================================

spaces_download() {
  local KEY="$1"
  local LOCAL_PATH="$2"
  python3 << PYEOF
import boto3, os, sys
s3 = boto3.client('s3',
    region_name='${SPACES_REGION}',
    endpoint_url='https://${SPACES_REGION}.digitaloceanspaces.com',
    aws_access_key_id=os.environ['SPACES_ACCESS_KEY'],
    aws_secret_access_key=os.environ['SPACES_SECRET_KEY'])
try:
    s3.download_file('${SPACES_BUCKET}', '${KEY}', '${LOCAL_PATH}')
    size = os.path.getsize('${LOCAL_PATH}')
    print(f'  Downloaded: {size} bytes')
except Exception as e:
    print(f'FAILED: {e}', file=sys.stderr)
    sys.exit(1)
PYEOF
}

spaces_upload() {
  local LOCAL_PATH="$1"
  local KEY="$2"
  python3 << PYEOF
import boto3, os, sys
s3 = boto3.client('s3',
    region_name='${SPACES_REGION}',
    endpoint_url='https://${SPACES_REGION}.digitaloceanspaces.com',
    aws_access_key_id=os.environ['SPACES_ACCESS_KEY'],
    aws_secret_access_key=os.environ['SPACES_SECRET_KEY'])
try:
    s3.upload_file('${LOCAL_PATH}', '${SPACES_BUCKET}', '${KEY}',
                   ExtraArgs={'ContentType': 'application/json'})
    size = os.path.getsize('${LOCAL_PATH}')
    print(f'  Uploaded: {size} bytes to ${KEY}')
except Exception as e:
    print(f'FAILED: {e}', file=sys.stderr)
    sys.exit(1)
PYEOF
}

spaces_exists() {
  local KEY="$1"
  python3 << PYEOF
import boto3, os, sys
s3 = boto3.client('s3',
    region_name='${SPACES_REGION}',
    endpoint_url='https://${SPACES_REGION}.digitaloceanspaces.com',
    aws_access_key_id=os.environ['SPACES_ACCESS_KEY'],
    aws_secret_access_key=os.environ['SPACES_SECRET_KEY'])
try:
    s3.head_object(Bucket='${SPACES_BUCKET}', Key='${KEY}')
    print('EXISTS')
except:
    print('MISSING')
PYEOF
}

# ============================================================================
# SHARED: REPORT FOOTER
# ============================================================================

report_footer() {
  local SCRIPT_END
  SCRIPT_END=$(date +%s)
  local DURATION=$((SCRIPT_END - SCRIPT_START))
  echo ""
  echo "  Duration: ${DURATION}s"
  echo "  Enterprise Excellence. Schema-First. No Shortcuts."
}

# ============================================================================
# MODE: SETUP — Full IFC → Speckle provisioning
# ============================================================================

mode_setup() {
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  DEC-020: PROVISION DEMO PROJECT — setup mode                       ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""

  # --- Stage 1: Validate ---
  echo "[Stage 1/7] Validating inputs..."
  validate_common STAGING_URL PROJECT_ID SPECKLE_TOKEN SPECKLE_SERVER_URL \
                  SPACES_ACCESS_KEY SPACES_SECRET_KEY

  echo "  STAGING_URL:       SET"
  echo "  PROJECT_ID:        ${PROJECT_ID:0:8}..."
  echo "  SPECKLE_TOKEN:     ${SPECKLE_TOKEN:0:8}... (len=${#SPECKLE_TOKEN})"
  echo "  SPECKLE_SERVER_URL: SET"
  echo "  SPACES keys:       SET"
  echo "✅ All inputs validated"
  echo ""

  # --- Stage 2: Download IFC from Spaces ---
  echo "[Stage 2/7] Downloading IFC files from DO Spaces..."

  IFC_DIR="/tmp/ectropy-ifc-$$"
  mkdir -p "$IFC_DIR"

  python3 << PYEOF
import boto3, os, sys
s3 = boto3.client('s3',
    region_name='${SPACES_REGION}',
    endpoint_url='https://${SPACES_REGION}.digitaloceanspaces.com',
    aws_access_key_id=os.environ['SPACES_ACCESS_KEY'],
    aws_secret_access_key=os.environ['SPACES_SECRET_KEY'])
files = {
    'ARC': '${IFC_FILES[ARC]}',
    'STR': '${IFC_FILES[STR]}',
    'MEP': '${IFC_FILES[MEP]}',
}
for disc, filename in files.items():
    key = '${IFC_BASE_PATH}/' + filename
    local_path = '${IFC_DIR}/' + filename
    print(f'  Downloading {disc}: {filename}...', end=' ', flush=True)
    try:
        s3.download_file('${SPACES_BUCKET}', key, local_path)
        size = os.path.getsize(local_path)
        print(f'{size / 1024 / 1024:.1f} MB')
    except Exception as e:
        print(f'FAILED: {e}')
        sys.exit(1)
print('✅ All IFC files downloaded')
PYEOF
  echo ""

  # --- Stage 3: Create Speckle stream ---
  echo "[Stage 3/7] Creating Speckle stream..."

  GRAPHQL_URL="${SPECKLE_SERVER_URL}/graphql"

  CREATE_RESP=$(curl -sf -X POST "$GRAPHQL_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SPECKLE_TOKEN" \
    -d '{
      "query": "mutation { streamCreate(stream: { name: \"Maple Ridge Commerce Centre\", description: \"Multi-discipline IFC model (ARC+STR+MEP) — DEC-020 provisioned\", isPublic: true }) }"
    }')

  STREAM_ID=$(echo "$CREATE_RESP" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    sid = d.get('data', {}).get('streamCreate')
    if sid: print(sid)
    else:
        print('ERROR:', json.dumps(d.get('errors', d)), file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print('ERROR:', e, file=sys.stderr); sys.exit(1)
")

  if [ -z "$STREAM_ID" ]; then
    echo "❌ FATAL: Failed to create Speckle stream"
    echo "  Response: $CREATE_RESP"
    exit 1
  fi

  echo "  Stream ID: ${STREAM_ID:0:10}..."
  echo "✅ Stream created"
  echo ""

  # --- Stage 4: Upload IFC files ---
  echo "[Stage 4/7] Uploading IFC files to Speckle..."

  declare -A BLOB_IDS=()

  for DISC in "${DISCIPLINES[@]}"; do
    FILENAME="${IFC_FILES[$DISC]}"
    LOCAL_PATH="${IFC_DIR}/${FILENAME}"
    MODEL_NAME="${DISC}"
    UPLOAD_URL="${SPECKLE_SERVER_URL}/api/file/autodetect/${STREAM_ID}/${MODEL_NAME}"

    echo "  Uploading ${DISC}: ${FILENAME}..."
    UPLOAD_RESP=$(curl -sf -X POST "$UPLOAD_URL" \
      -H "Authorization: Bearer $SPECKLE_TOKEN" \
      -F "file=@${LOCAL_PATH}" \
      --max-time 300)

    BLOB_ID=$(echo "$UPLOAD_RESP" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    bid = d.get('uploadResults', [{}])[0].get('blobId') or d.get('blobId') or d.get('id') or d.get('objectId')
    if bid: print(bid)
    else: print('', file=sys.stderr); print('')
except: print('')
")

    if [ -n "$BLOB_ID" ]; then
      echo "    Blob ID: ${BLOB_ID:0:12}..."
      BLOB_IDS[$DISC]="$BLOB_ID"
    else
      echo "    ⚠️  No blob ID returned — will poll for commit instead"
      BLOB_IDS[$DISC]=""
    fi
  done

  echo "✅ All IFC files uploaded"
  echo ""

  # --- Stage 5: Poll file imports ---
  echo "[Stage 5/7] Polling for file import completion..."

  MAX_POLL=60
  POLL_INTERVAL=15

  declare -A OBJECT_IDS=()

  for DISC in "${DISCIPLINES[@]}"; do
    echo "  Waiting for ${DISC} import..."

    for attempt in $(seq 1 $MAX_POLL); do
      POLL_RESP=$(curl -sf -X POST "$GRAPHQL_URL" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $SPECKLE_TOKEN" \
        -d "{
          \"query\": \"{ stream(id: \\\"${STREAM_ID}\\\") { branch(name: \\\"${DISC}\\\") { commits(limit: 1) { items { id referencedObject } } } } }\"
        }" 2>/dev/null || echo '{}')

      REF_OBJ=$(echo "$POLL_RESP" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    items = d.get('data',{}).get('stream',{}).get('branch',{}).get('commits',{}).get('items',[])
    if items and items[0].get('referencedObject'): print(items[0]['referencedObject'])
    else: print('')
except: print('')
")

      if [ -n "$REF_OBJ" ]; then
        OBJECT_IDS[$DISC]="$REF_OBJ"
        echo "    ✅ ${DISC} complete: ${REF_OBJ:0:12}... (attempt ${attempt})"
        break
      fi

      if [ "$attempt" -eq "$MAX_POLL" ]; then
        echo "    ❌ ${DISC} import timed out after $((MAX_POLL * POLL_INTERVAL))s"
        exit 1
      fi

      printf "    [%d/%d] Waiting %ds...\r" "$attempt" "$MAX_POLL" "$POLL_INTERVAL"
      sleep "$POLL_INTERVAL"
    done
  done

  echo "✅ All file imports complete"
  echo ""

  # --- Stage 6: Update project record ---
  echo "[Stage 6/7] Updating project record..."

  UPDATE_RESP=$(curl -sf -X POST "${STAGING_URL}/api/v1/speckle/streams" \
    -H "Content-Type: application/json" \
    -d "{
      \"projectId\": \"${PROJECT_ID}\",
      \"streamId\": \"${STREAM_ID}\",
      \"streamName\": \"Maple Ridge Commerce Centre\"
    }" 2>/dev/null || echo '{"error":"update failed"}')

  echo "  Project→Stream link: $(echo "$UPDATE_RESP" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    if 'error' in d: print('WARN: ' + str(d['error']))
    else: print('OK')
except: print('response not JSON')
")"
  echo ""

  # --- Stage 7: Report ---
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  DEC-020: SETUP COMPLETE                                            ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Project ID:    ${PROJECT_ID:0:8}..."
  echo "  Stream ID:     ${STREAM_ID:0:10}..."
  echo "  ARC object:    ${OBJECT_IDS[ARC]:0:12}..."
  echo "  STR object:    ${OBJECT_IDS[STR]:0:12}..."
  echo "  MEP object:    ${OBJECT_IDS[MEP]:0:12}..."
  echo ""
  echo "  Next steps:"
  echo "    1. Open viewer: ${STAGING_URL}/viewer?project=${PROJECT_ID}"
  echo "    2. Select stream → model loads → onViewerReady fires"
  echo "    3. BOX generation triggers automatically (DEC-017)"
  echo "    4. Voxels populate in ~2-5 minutes"
  echo "    5. Run: provision-demo.sh export  (after BOX cells exist)"
  report_footer

  rm -rf "$IFC_DIR"
}

# ============================================================================
# MODE: EXPORT — Snapshot BOX cells + decisions to Spaces
# ============================================================================

mode_export() {
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  DEC-020: EXPORT BOX SNAPSHOT                                       ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""

  validate_common PROJECT_ID DATABASE_URL SPACES_ACCESS_KEY SPACES_SECRET_KEY

  echo "[Step 1/3] Checking voxel count..."

  VOXEL_COUNT=$(python3 << PYEOF
import subprocess, sys
result = subprocess.run(
    ['psql', '-t', '-A', '-c',
     "SELECT COUNT(*) FROM voxels WHERE project_id='${PROJECT_ID}';",
     '${DATABASE_URL}'],
    capture_output=True, text=True, timeout=30)
if result.returncode != 0:
    print('ERROR: ' + result.stderr.strip(), file=sys.stderr)
    sys.exit(1)
print(result.stdout.strip())
PYEOF
)

  echo "  Voxel count: ${VOXEL_COUNT}"

  if [ "$VOXEL_COUNT" -eq 0 ] 2>/dev/null; then
    echo ""
    echo "  No BOX cells found — skipping snapshot export."
    echo "  Open the viewer to trigger BOX generation, then re-run export."
    exit 0
  fi

  echo ""
  echo "[Step 2/3] Exporting voxels to Spaces..."

  SNAPSHOT_FILE="/tmp/voxels-cache-$$.json"
  python3 << PYEOF
import subprocess, sys, json
result = subprocess.run(
    ['psql', '-t', '-A', '-c',
     "SELECT json_agg(row_to_json(v)) FROM voxels v WHERE project_id='${PROJECT_ID}';",
     '${DATABASE_URL}'],
    capture_output=True, text=True, timeout=120)
if result.returncode != 0:
    print('ERROR: ' + result.stderr.strip(), file=sys.stderr)
    sys.exit(1)
data = result.stdout.strip()
if not data or data == 'null':
    print('ERROR: empty result', file=sys.stderr)
    sys.exit(1)
# Validate it is JSON
parsed = json.loads(data)
with open('${SNAPSHOT_FILE}', 'w') as f:
    json.dump(parsed, f)
print(f'  Exported {len(parsed)} voxels to snapshot file')
PYEOF

  spaces_upload "$SNAPSHOT_FILE" "$VOXELS_CACHE_KEY"
  rm -f "$SNAPSHOT_FILE"

  echo ""
  echo "[Step 3/3] Exporting voxel_grids metadata..."

  GRIDS_FILE="/tmp/voxel-grids-$$.json"
  python3 << PYEOF
import subprocess, sys, json
result = subprocess.run(
    ['psql', '-t', '-A', '-c',
     "SELECT json_agg(row_to_json(g)) FROM voxel_grids g WHERE project_id='${PROJECT_ID}';",
     '${DATABASE_URL}'],
    capture_output=True, text=True, timeout=30)
if result.returncode != 0:
    print('WARN: voxel_grids export failed', file=sys.stderr)
else:
    data = result.stdout.strip()
    if data and data != 'null':
        parsed = json.loads(data)
        with open('${GRIDS_FILE}', 'w') as f:
            json.dump(parsed, f)
        print(f'  Exported {len(parsed)} grid records')
    else:
        print('  No voxel_grids records found')
PYEOF

  if [ -f "$GRIDS_FILE" ]; then
    spaces_upload "$GRIDS_FILE" "${SEED_BASE_PATH}/voxel-grids-cache.json"
    rm -f "$GRIDS_FILE"
  fi

  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  DEC-020: EXPORT COMPLETE                                           ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  BOX snapshot exported: ${VOXEL_COUNT} cells to Spaces"
  echo "  Key: ${VOXELS_CACHE_KEY}"
  echo "  Restore with: provision-demo.sh load"
  report_footer
}

# ============================================================================
# MODE: LOAD — Fast restore from Spaces snapshot (<60s target)
# ============================================================================

mode_load() {
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  DEC-020: FAST RESTORE — load mode (target <60s)                    ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""

  validate_common PROJECT_ID SPECKLE_TOKEN SPECKLE_SERVER_URL \
                  SPACES_ACCESS_KEY SPACES_SECRET_KEY DATABASE_URL

  GRAPHQL_URL="${SPECKLE_SERVER_URL}/graphql"

  # --- Step 1: Verify Speckle stream exists ---
  echo "[Step 1/5] Verifying Speckle stream..."

  STREAM_CHECK=$(curl -sf -X POST "$GRAPHQL_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SPECKLE_TOKEN" \
    -d "{
      \"query\": \"{ streams(limit: 5) { items { id name } } }\"
    }" 2>/dev/null || echo '{}')

  STREAM_COUNT=$(echo "$STREAM_CHECK" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    items = d.get('data',{}).get('streams',{}).get('items',[])
    print(len(items))
    for s in items:
        print(f'  Stream: {s[\"id\"][:10]}... — {s[\"name\"]}', file=sys.stderr)
except: print('0')
" 2>&1)

  if [ "$STREAM_COUNT" = "0" ]; then
    echo "  ❌ No Speckle streams found — run setup mode first"
    echo "  Usage: provision-demo.sh setup"
    exit 1
  fi

  echo "  Speckle streams: VERIFIED (${STREAM_COUNT} found)"
  echo ""

  # --- Step 2: Download voxels snapshot from Spaces ---
  echo "[Step 2/5] Downloading BOX snapshot from Spaces..."

  CACHE_STATUS=$(spaces_exists "$VOXELS_CACHE_KEY")

  if [ "$CACHE_STATUS" = "MISSING" ]; then
    echo "  ❌ No BOX snapshot in Spaces — run setup + export first"
    echo "  Usage: provision-demo.sh setup  (then open viewer, then export)"
    exit 1
  fi

  SNAPSHOT_FILE="/tmp/voxels-load-$$.json"
  spaces_download "$VOXELS_CACHE_KEY" "$SNAPSHOT_FILE"

  CELL_COUNT=$(python3 -c "
import json
with open('${SNAPSHOT_FILE}') as f:
    data = json.load(f)
print(len(data))
")
  echo "  BOX cells in snapshot: ${CELL_COUNT}"
  echo ""

  # --- Step 3: Restore BOX cells to DB ---
  echo "[Step 3/5] Restoring BOX cells to database..."

  echo "  Clearing existing voxels for project ${PROJECT_ID:0:8}..."
  psql "$DATABASE_URL" -c \
    "DELETE FROM voxels WHERE project_id='${PROJECT_ID}';" 2>/dev/null || true
  psql "$DATABASE_URL" -c \
    "DELETE FROM voxel_grids WHERE project_id='${PROJECT_ID}';" 2>/dev/null || true

  # Convert JSON snapshot to CSV, then COPY FROM STDIN for bulk load.
  # 200K+ rows in under 10 seconds vs minutes with batched INSERT.
  CSV_FILE="/tmp/voxels-csv-$$.csv"

  python3 << PYEOF
import json, csv, sys

with open('${SNAPSHOT_FILE}') as f:
    data = json.load(f)

if not data:
    print('ERROR: empty snapshot', file=sys.stderr)
    sys.exit(1)

# Column order must match the COPY command below
columns = [
    'id', 'urn', 'voxel_id', 'project_id', 'voxel_grid_id', 'parent_voxel_id',
    'coord_x', 'coord_y', 'coord_z',
    'min_x', 'max_x', 'min_y', 'max_y', 'min_z', 'max_z',
    'resolution', 'status', 'health_status', 'system', 'level', 'ifc_elements',
]

with open('${CSV_FILE}', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(columns)
    for v in data:
        ifc = v.get('ifc_elements')
        if isinstance(ifc, list):
            ifc_str = '{' + ','.join(str(e) for e in ifc) + '}'
        elif ifc:
            ifc_str = str(ifc)
        else:
            ifc_str = ''
        writer.writerow([
            v.get('id', ''), v.get('urn', ''), v.get('voxel_id', ''),
            v.get('project_id', ''), v.get('voxel_grid_id', ''),
            v.get('parent_voxel_id', ''),
            v.get('coord_x', ''), v.get('coord_y', ''), v.get('coord_z', ''),
            v.get('min_x', ''), v.get('max_x', ''),
            v.get('min_y', ''), v.get('max_y', ''),
            v.get('min_z', ''), v.get('max_z', ''),
            v.get('resolution', ''), v.get('status', ''),
            v.get('health_status', ''), v.get('system', ''),
            v.get('level', ''), ifc_str,
        ])

print(f'  CSV generated: {len(data)} rows')
PYEOF

  echo "  Loading via COPY FROM STDIN..."
  psql "$DATABASE_URL" -c "\COPY voxels (id, urn, voxel_id, project_id, voxel_grid_id, parent_voxel_id, coord_x, coord_y, coord_z, min_x, max_x, min_y, max_y, min_z, max_z, resolution, status, health_status, system, level, ifc_elements) FROM '${CSV_FILE}' CSV HEADER"

  RESTORED_COUNT=$(psql -t -A "$DATABASE_URL" -c \
    "SELECT COUNT(*) FROM voxels WHERE project_id='${PROJECT_ID}';")
  echo "  ✅ BOX cells restored: ${RESTORED_COUNT}"

  # Restore voxel_grids metadata if snapshot exists
  GRIDS_CACHE_KEY="${SEED_BASE_PATH}/voxel-grids-cache.json"
  GRIDS_STATUS=$(spaces_exists "$GRIDS_CACHE_KEY")
  if [ "$GRIDS_STATUS" = "EXISTS" ]; then
    GRIDS_FILE="/tmp/voxel-grids-load-$$.json"
    spaces_download "$GRIDS_CACHE_KEY" "$GRIDS_FILE"
    python3 << PYEOF
import json, subprocess, sys

with open('${GRIDS_FILE}') as f:
    grids = json.load(f)

for g in (grids if isinstance(grids, list) else []):
    gid = g.get('id', '')
    sql = (
        f"INSERT INTO voxel_grids (id, project_id, stream_id, object_id, resolution, "
        f"resolution_tier, source_type, status, voxel_count, "
        f"bbox_min_x, bbox_max_x, bbox_min_y, bbox_max_y, bbox_min_z, bbox_max_z, generated_at) "
        f"VALUES ('{gid}', '{g.get('project_id','')}', '{g.get('stream_id','')}', "
        f"'{g.get('object_id','')}', {g.get('resolution',0)}, "
        f"'{g.get('resolution_tier','COARSE')}', '{g.get('source_type','BIM')}', "
        f"'{g.get('status','COMPLETE')}', {g.get('voxel_count',0)}, "
        f"{g.get('bbox_min_x',0)}, {g.get('bbox_max_x',0)}, "
        f"{g.get('bbox_min_y',0)}, {g.get('bbox_max_y',0)}, "
        f"{g.get('bbox_min_z',0)}, {g.get('bbox_max_z',0)}, "
        f"'{g.get('generated_at', '2026-01-01')}') "
        f"ON CONFLICT (id) DO NOTHING;"
    )
    subprocess.run(['psql', '-c', sql, '${DATABASE_URL}'],
                   capture_output=True, text=True, timeout=10)

print(f'  ✅ voxel_grids restored: {len(grids if isinstance(grids, list) else [])}')
PYEOF
    rm -f "$GRIDS_FILE"
  fi

  rm -f "$SNAPSHOT_FILE" "$CSV_FILE"
  echo ""

  # --- Step 4: Restore decisions (if snapshot exists) ---
  echo "[Step 4/5] Checking for decisions snapshot..."

  DECISIONS_STATUS=$(spaces_exists "$DECISIONS_KEY")

  if [ "$DECISIONS_STATUS" = "EXISTS" ]; then
    DECISIONS_FILE="/tmp/decisions-load-$$.json"
    spaces_download "$DECISIONS_KEY" "$DECISIONS_FILE"
    DEC_COUNT=$(python3 -c "
import json
with open('${DECISIONS_FILE}') as f:
    data = json.load(f)
print(len(data) if isinstance(data, list) else 0)
")
    echo "  Decisions in snapshot: ${DEC_COUNT}"
    # Decision restore deferred — schema varies. Print count only.
    echo "  ⚠️  Decision UPSERT deferred to link-decisions.sh"
    rm -f "$DECISIONS_FILE"
  else
    echo "  No decisions snapshot in Spaces — skipping"
  fi
  echo ""

  # --- Step 5: Restore SEPPA context (if snapshot exists) ---
  echo "[Step 5/5] Checking for SEPPA context snapshot..."

  SEPPA_STATUS=$(spaces_exists "$SEPPA_CONTEXT_KEY")

  if [ "$SEPPA_STATUS" = "EXISTS" ]; then
    SEPPA_FILE="/tmp/seppa-context-$$.json"
    spaces_download "$SEPPA_CONTEXT_KEY" "$SEPPA_FILE"
    echo "  SEPPA context found — updating project record..."
    python3 << PYEOF
import json, subprocess, sys
with open('${SEPPA_FILE}') as f:
    ctx = json.load(f)
ctx_str = json.dumps(ctx).replace("'", "''")
sql = f"UPDATE projects SET seppa_context = '{ctx_str}'::jsonb WHERE id = '${PROJECT_ID}';"
result = subprocess.run(
    ['psql', '-c', sql, '${DATABASE_URL}'],
    capture_output=True, text=True, timeout=30)
if result.returncode == 0:
    print('  ✅ SEPPA context restored')
else:
    print(f'  WARN: SEPPA update failed: {result.stderr[:200]}')
PYEOF
    rm -f "$SEPPA_FILE"
  else
    echo "  No SEPPA context snapshot — skipping"
  fi

  # --- Report ---
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  DEC-020: LOAD COMPLETE                                             ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  BOX cells restored: ${CELL_COUNT}"
  echo "  Speckle streams:    VERIFIED"
  echo "  Viewer:             ${STAGING_URL:-https://staging.ectropy.ai}/viewer?project=${PROJECT_ID}"
  report_footer
}

# ============================================================================
# MAIN — MODE DISPATCH
# ============================================================================

case "$MODE" in
  setup)
    mode_setup
    ;;
  export)
    mode_export
    ;;
  load)
    mode_load
    ;;
  *)
    echo "Usage: provision-demo.sh [setup|load|export]"
    echo ""
    echo "  setup   — Full IFC → Speckle provisioning (10-15 min)"
    echo "  load    — Fast restore from Spaces snapshot (<60s)"
    echo "  export  — Export BOX snapshot to Spaces (after BOX generation)"
    exit 1
    ;;
esac
