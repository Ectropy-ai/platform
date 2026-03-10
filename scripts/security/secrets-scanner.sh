#!/bin/bash

# Enterprise Secrets Scanner v2.0
# Prevents accidental commit of secrets while allowing legitimate dev configs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Files that are allowed to have development secrets
ALLOWED_DEV_FILES=(
  ".env.development"
  ".env.example"
  ".env.template"
  "docker-compose.local.yml"
  "docker-compose.development.yml"
)

# File patterns to exclude from scanning (scripts, docs, etc.)
EXCLUDED_PATTERNS=(
  "scripts/"
  "docs/"
  "*.md"
  "*.sh"
  ".husky/"
)

# Patterns that indicate production secrets (always block)
PRODUCTION_PATTERNS=(
  "sk-[a-zA-Z0-9]"  # OpenAI production keys (starts with sk-)
  "ghp_[a-zA-Z0-9]"  # GitHub personal access tokens
  "ghs_[a-zA-Z0-9]"  # GitHub server tokens
  "AKIA[0-9A-Z]"     # AWS access keys
  "BEGIN RSA PRIVATE KEY"
  "BEGIN OPENSSH PRIVATE KEY"
  "mongodb+srv://[^$]*:[^$]*@"      # MongoDB connection strings with actual credentials (not env vars)
  "postgres://[^$]*:[^$]*@"    # PostgreSQL URLs with actual passwords (not env vars)
  "redis://[^$]*:[^$]*@"       # Redis URLs with actual passwords (not env vars)
  "Bearer [A-Za-z0-9\-_]{10,}" # Bearer tokens in code
  "Authorization: Bearer"      # Authorization headers
)

# Development patterns (allowed in dev files only)
DEV_PATTERNS=(
  "development_jwt_secret"
  "development_session_secret"
  "localhost"
  "127.0.0.1"
  "postgres://postgres:postgres@"
)

# Function to check if file should be excluded from scanning
should_exclude_file() {
  local file="$1"

# Check .secretsignore patterns
  if [[ -f ".secretsignore" ]]; then
    while IFS= read -r pattern || [[ -n "$pattern" ]]; do
      # Strip all whitespace and control characters (CRLF fix)
      pattern=$(echo "$pattern" | tr -d '\r' | xargs)

      # Skip comments and empty lines
      [[ "$pattern" =~ ^#.*$ ]] && continue
      [[ -z "$pattern" ]] && continue

      # Convert ** glob patterns to work with case matching
      # evidence/**/* becomes evidence/* (match anything in evidence/)
      if [[ "$pattern" == *"/**/"* ]] || [[ "$pattern" == *"/**" ]]; then
        # Extract the base directory (e.g., "evidence" from "evidence/**/*")
        local base_dir="${pattern%%/**}"
        # Check if file starts with base directory
        if [[ "$file" == "$base_dir"/* ]]; then
          return 0
        fi
      fi

      # Use case statement for simple glob pattern matching
      case "$file" in
        $pattern)
          return 0
          ;;
      esac
    done < .secretsignore
  fi

  # Fallback: Check for hardcoded pattern matches
  if [[ "$file" == scripts/* ]] ||
     [[ "$file" == docs/* ]] ||
     [[ "$file" == *.md ]] ||
     [[ "$file" == *.sh ]] ||
     [[ "$file" == .husky/* ]]; then
    return 0
  fi

  return 1
}

# Function to check if file is in allowed list
is_allowed_file() {
  local file="$1"
  local filename=$(basename "$file")
  
  for allowed in "${ALLOWED_DEV_FILES[@]}"; do
    if [[ "$filename" == "$allowed" ]]; then
      return 0
    fi
  done
  return 1
}

# Function to scan a file for secrets
scan_file() {
  local file="$1"
  local content="$2"
  local found_secrets=0
  
  # Skip binary files
  if file "$file" 2>/dev/null | grep -q "binary"; then
    return 0
  fi
  
  # Check for production secrets (always bad, even in allowed files)
  for pattern in "${PRODUCTION_PATTERNS[@]}"; do
    if echo "$content" | grep -q "$pattern"; then
      echo -e "${RED}❌ Production secret pattern found in $file${NC}"
      echo -e "   Pattern: $pattern"
      found_secrets=1
    fi
  done
  
  # For allowed development files, skip generic secret detection
  if is_allowed_file "$file"; then
    return $found_secrets
  fi
  
  # For non-allowed files, check for any secret-like patterns
  if echo "$content" | grep -qE "(api[_-]?key|secret|password|token|bearer|private[_-]?key)" && ! echo "$content" | grep -qE "(development_|example|template|TODO|CHANGEME|your[_-])"; then
    echo -e "${YELLOW}⚠️  Potential secret in $file${NC}"
    echo -e "   Move to .env.development or use environment variables"
    found_secrets=1
  fi
  
  return $found_secrets
}

# Main scanning logic
main() {
  local exit_code=0
  local files_scanned=0
  local mode="${1:-all}"
  
  echo -e "${GREEN}🔍 Ectropy Enterprise Secrets Scanner${NC}"
  echo "Mode: $mode"
  
  # Get files to scan based on mode
  if [[ "$mode" == "scan-staged" || "$mode" == "--staged" ]]; then
    # Scan only staged files
    FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || echo "")
  else
    # Scan all tracked files
    FILES=$(git ls-files 2>/dev/null || find . -type f -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.env*" 2>/dev/null)
  fi
  
  # Check if there are files to scan
  if [[ -z "$FILES" ]]; then
    echo -e "${GREEN}✅ No files to scan${NC}"
    exit 0
  fi
  
  # Scan each file
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    [[ ! -f "$file" ]] && continue
    
   # Skip excluded files
    if should_exclude_file "$file"; then
    
      continue
    fi

    
    
    files_scanned=$((files_scanned + 1))
    
    # Read file content
    if [[ -r "$file" ]]; then
      content=$(cat "$file" 2>/dev/null || echo "")
      
      if ! scan_file "$file" "$content"; then
        exit_code=1
      fi
    fi
  done <<< "$FILES"
  
  # Fix for line 504 - ensure integer comparison
  if [[ "$files_scanned" -eq 0 ]]; then
    echo -e "${YELLOW}No files scanned${NC}"
  else
    echo -e "\nScanned $files_scanned files"
  fi
  
  # Summary
  if [[ "$exit_code" -eq 0 ]]; then
    echo -e "${GREEN}✅ No secrets detected - safe to commit${NC}"
  else
    echo -e "\n${RED}❌ Secrets detected in staged files!${NC}"
    echo -e "Please remove secrets before committing."
    echo -e "Use environment variables or secure configuration files."
    echo -e "\nTo bypass for development files only (USE WITH CAUTION):"
    echo -e "  git commit --no-verify -m \"your message\""
  fi
  
  exit $exit_code
}

# Run main function
main "$@"