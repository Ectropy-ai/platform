#!/bin/bash
# Evidence Archival Script
# Archives evidence older than 30 days to Git LFS-tracked compressed format
# Maintains 90-day retention policy with automatic cleanup

set -euo pipefail

# Configuration
EVIDENCE_DIR="evidence"
ARCHIVE_DIR="evidence/archive"
RETENTION_DAYS=90
ARCHIVE_THRESHOLD_DAYS=30
DATE_FORMAT="%Y-%m-%d"
CURRENT_DATE=$(date +"%Y-%m-%d")

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Ensure we're in the repository root
if [ ! -d ".git" ]; then
    log_error "Must be run from repository root"
    exit 1
fi

# Create archive directory if it doesn't exist
mkdir -p "$ARCHIVE_DIR"

log_info "Starting evidence archival process..."
log_info "Archive threshold: ${ARCHIVE_THRESHOLD_DAYS} days"
log_info "Retention period: ${RETENTION_DAYS} days"

# Function to get directory age in days
get_dir_age_days() {
    local dir="$1"
    local dir_date
    
    # Extract date from directory name (assumes format: issue-name-YYYY-MM-DD or similar)
    dir_date=$(echo "$dir" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
    
    if [ -z "$dir_date" ]; then
        # If no date in dirname, use modification time
        if [ -d "$EVIDENCE_DIR/$dir" ]; then
            dir_date=$(date -r "$EVIDENCE_DIR/$dir" +"%Y-%m-%d" 2>/dev/null || echo "")
        fi
    fi
    
    if [ -z "$dir_date" ]; then
        echo "999" # Unknown age, don't archive
        return
    fi
    
    # Calculate age in days
    local current_epoch=$(date -d "$CURRENT_DATE" +%s)
    local dir_epoch=$(date -d "$dir_date" +%s 2>/dev/null || echo "0")
    
    if [ "$dir_epoch" -eq "0" ]; then
        echo "999"
        return
    fi
    
    local age_days=$(( (current_epoch - dir_epoch) / 86400 ))
    echo "$age_days"
}

# Archive evidence directories older than threshold
archived_count=0
skipped_count=0

log_info "Scanning evidence directory for items to archive..."

if [ -d "$EVIDENCE_DIR" ]; then
    for dir in "$EVIDENCE_DIR"/*; do
        # Skip if not a directory or is the archive directory itself
        if [ ! -d "$dir" ] || [ "$dir" = "$ARCHIVE_DIR" ]; then
            continue
        fi
        
        dirname=$(basename "$dir")
        age_days=$(get_dir_age_days "$dirname")
        
        log_info "Checking: $dirname (age: ${age_days} days)"
        
        # Archive if older than threshold
        if [ "$age_days" -ge "$ARCHIVE_THRESHOLD_DAYS" ] && [ "$age_days" -lt "999" ]; then
            log_info "Archiving: $dirname (${age_days} days old)"
            
            # Create archive filename with timestamp
            archive_name="${dirname}_archived_${CURRENT_DATE}.tar.gz"
            archive_path="${ARCHIVE_DIR}/${archive_name}"
            
            # Create compressed archive
            if tar -czf "$archive_path" -C "$EVIDENCE_DIR" "$dirname" 2>/dev/null; then
                log_success "Created archive: $archive_name"
                
                # Verify archive integrity
                if tar -tzf "$archive_path" >/dev/null 2>&1; then
                    log_success "Archive verified: $archive_name"
                    
                    # Remove original directory
                    rm -rf "$dir"
                    log_success "Removed original: $dirname"
                    
                    archived_count=$((archived_count + 1))
                else
                    log_error "Archive verification failed: $archive_name"
                    rm -f "$archive_path"
                fi
            else
                log_error "Failed to create archive: $archive_name"
            fi
        else
            log_info "Skipping: $dirname (not old enough or invalid date)"
            skipped_count=$((skipped_count + 1))
        fi
    done
fi

# Cleanup old archives beyond retention period
log_info "Checking for archives beyond retention period..."
deleted_count=0

if [ -d "$ARCHIVE_DIR" ]; then
    for archive in "$ARCHIVE_DIR"/*.tar.gz; do
        if [ ! -f "$archive" ]; then
            continue
        fi
        
        archive_name=$(basename "$archive")
        
        # Extract archive date (format: *_archived_YYYY-MM-DD.tar.gz)
        archive_date=$(echo "$archive_name" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | tail -1)
        
        if [ -n "$archive_date" ]; then
            age_days=$(get_dir_age_days "$archive_date")
            
            if [ "$age_days" -gt "$RETENTION_DAYS" ]; then
                log_warning "Deleting old archive: $archive_name (${age_days} days old)"
                rm -f "$archive"
                deleted_count=$((deleted_count + 1))
            fi
        fi
    done
fi

# Summary
echo ""
log_info "========================================="
log_info "Evidence Archival Summary"
log_info "========================================="
log_success "Archived: ${archived_count} directories"
log_info "Skipped: ${skipped_count} directories"
log_warning "Deleted: ${deleted_count} old archives"
log_info "========================================="

# Calculate evidence directory size
evidence_size=$(du -sh "$EVIDENCE_DIR" 2>/dev/null | cut -f1)
archive_size=$(du -sh "$ARCHIVE_DIR" 2>/dev/null | cut -f1)

log_info "Evidence directory size: ${evidence_size}"
log_info "Archive directory size: ${archive_size}"

# Check if Git LFS is tracking archives
log_info "Verifying Git LFS configuration..."
if git lfs track | grep -q "evidence/archive/\*.tar.gz"; then
    log_success "Git LFS is tracking archive files"
else
    log_error "Git LFS is NOT tracking archive files - please configure .gitattributes"
    exit 1
fi

log_success "Evidence archival completed successfully!"
exit 0
