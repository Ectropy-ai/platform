#!/bin/bash

# Enterprise Logging Framework
# Provides structured logging for CI/CD workflows

set -euo pipefail

# Log levels
readonly LOG_LEVEL_DEBUG=0
readonly LOG_LEVEL_INFO=1
readonly LOG_LEVEL_WARN=2
readonly LOG_LEVEL_ERROR=3
readonly LOG_LEVEL_FATAL=4

# Configuration
LOG_LEVEL=${LOG_LEVEL:-$LOG_LEVEL_INFO}
LOG_FORMAT=${LOG_FORMAT:-json}
LOG_FILE=${LOG_FILE:-/tmp/workflow.log}

# Structured logger
log_message() {
    local level=$1
    local message=$2
    local metadata=${3:-"{}"}
    local timestamp=$(date -Iseconds)
    local caller=${BASH_SOURCE[2]##*/}:${BASH_LINENO[1]}
    
    # Check log level
    local level_num
    case $level in
        DEBUG) level_num=$LOG_LEVEL_DEBUG ;;
        INFO)  level_num=$LOG_LEVEL_INFO ;;
        WARN)  level_num=$LOG_LEVEL_WARN ;;
        ERROR) level_num=$LOG_LEVEL_ERROR ;;
        FATAL) level_num=$LOG_LEVEL_FATAL ;;
        *) level_num=$LOG_LEVEL_INFO ;;
    esac
    
    [[ $level_num -lt $LOG_LEVEL ]] && return 0
    
    # Format output
    if [[ "$LOG_FORMAT" == "json" ]]; then
        jq -n \
            --arg timestamp "$timestamp" \
            --arg level "$level" \
            --arg message "$message" \
            --arg caller "$caller" \
            --argjson metadata "$metadata" \
            '{
                timestamp: $timestamp,
                level: $level,
                message: $message,
                caller: $caller,
                metadata: $metadata
            }' | tee -a "$LOG_FILE"
    else
        echo "[$timestamp] [$level] [$caller] $message" | tee -a "$LOG_FILE"
    fi
    
    # Exit on fatal
    [[ "$level" == "FATAL" ]] && exit 1
}

# Convenience functions
log_debug() { log_message "DEBUG" "$1" "${2:-{}}"; }
log_info()  { log_message "INFO" "$1" "${2:-{}}"; }
log_warn()  { log_message "WARN" "$1" "${2:-{}}"; }
log_error() { log_message "ERROR" "$1" "${2:-{}}"; }
log_fatal() { log_message "FATAL" "$1" "${2:-{}}"; }

# Export functions
export -f log_message log_debug log_info log_warn log_error log_fatal
