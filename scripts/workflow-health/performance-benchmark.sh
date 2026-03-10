#!/bin/bash

# =============================================================================
# CI/CD WORKFLOW PERFORMANCE BENCHMARK
# =============================================================================
# Measures and analyzes workflow execution performance characteristics
# Provides timing analysis, resource usage, and optimization recommendations
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORTS_DIR="$PROJECT_ROOT/reports/workflow-performance"
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
WORKFLOW_DIR="$PROJECT_ROOT/.github/workflows"

# Performance benchmarks (in minutes)
PERFORMANCE_TARGET_EXCELLENT=5
PERFORMANCE_TARGET_GOOD=10
PERFORMANCE_TARGET_ACCEPTABLE=20
PERFORMANCE_TARGET_MAXIMUM=30

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_header() { echo -e "${PURPLE}🔍 $1${NC}"; }

# Performance tracking
TOTAL_BENCHMARKS=0
EXCELLENT_PERFORMANCE=0
GOOD_PERFORMANCE=0
ACCEPTABLE_PERFORMANCE=0
POOR_PERFORMANCE=0

# Initialize reports directory
init_reports() {
    mkdir -p "$REPORTS_DIR"
    log_info "Workflow performance reports directory initialized: $REPORTS_DIR"
}

# Extract timing information from workflow
extract_workflow_timings() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Extracting timing information: $workflow_name"
    
    python3 << EOF
import yaml
import json

try:
    with open('$workflow_file', 'r') as f:
        workflow = yaml.safe_load(f)
    
    timing_info = {
        'workflow_name': '$workflow_name',
        'jobs': {},
        'total_estimated_time': 0,
        'longest_job_time': 0,
        'shortest_job_time': 999,
        'parallel_efficiency': 0,
        'has_timeouts': False,
        'has_caching': False,
        'has_matrix': False
    }
    
    for job_name, job_config in workflow.get('jobs', {}).items():
        timeout = job_config.get('timeout-minutes', 30)  # Default GitHub timeout
        steps_count = len(job_config.get('steps', []))
        
        # Estimate execution time based on steps and configuration
        estimated_time = min(timeout, max(5, steps_count * 2))  # 2 min per step average
        
        # Adjust for special configurations
        if job_config.get('strategy', {}).get('matrix'):
            timing_info['has_matrix'] = True
            matrix_size = 1
            matrix_config = job_config['strategy']['matrix']
            for key, values in matrix_config.items():
                if isinstance(values, list):
                    matrix_size *= len(values)
            estimated_time *= matrix_size
        
        if job_config.get('services'):
            estimated_time += 5  # Service startup overhead
        
        timing_info['jobs'][job_name] = {
            'timeout_minutes': timeout,
            'estimated_minutes': estimated_time,
            'steps_count': steps_count,
            'has_services': bool(job_config.get('services')),
            'has_matrix': bool(job_config.get('strategy', {}).get('matrix')),
            'runs_on': job_config.get('runs-on', 'ubuntu-latest')
        }
        
        timing_info['longest_job_time'] = max(timing_info['longest_job_time'], estimated_time)
        timing_info['shortest_job_time'] = min(timing_info['shortest_job_time'], estimated_time)
        timing_info['has_timeouts'] = timing_info['has_timeouts'] or (timeout < 60)
    
    # Check for caching
    workflow_content = open('$workflow_file').read()
    timing_info['has_caching'] = 'cache:' in workflow_content or 'actions/cache' in workflow_content
    
    # Calculate parallel execution estimate
    if workflow.get('jobs'):
        # Simple dependency analysis for parallel execution estimation
        job_dependencies = {}
        for job_name, job_config in workflow.get('jobs', {}).items():
            needs = job_config.get('needs', [])
            if isinstance(needs, str):
                needs = [needs]
            job_dependencies[job_name] = needs
        
        # Calculate execution levels
        levels = []
        remaining_jobs = set(job_dependencies.keys())
        
        while remaining_jobs:
            current_level = []
            for job in list(remaining_jobs):
                dependencies = job_dependencies[job]
                if all(dep not in remaining_jobs for dep in dependencies):
                    current_level.append(job)
            
            for job in current_level:
                remaining_jobs.remove(job)
            
            if current_level:
                levels.append(current_level)
            else:
                break
        
        # Calculate total time considering parallel execution
        total_time = 0
        for level in levels:
            level_time = max(timing_info['jobs'][job]['estimated_minutes'] for job in level if job in timing_info['jobs'])
            total_time += level_time
        
        timing_info['total_estimated_time'] = total_time
        timing_info['parallel_levels'] = len(levels)
        timing_info['max_parallel_jobs'] = max(len(level) for level in levels) if levels else 1
        
        # Calculate efficiency (actual vs sequential execution)
        sequential_time = sum(timing_info['jobs'][job]['estimated_minutes'] for job in timing_info['jobs'])
        timing_info['parallel_efficiency'] = round((sequential_time / total_time) if total_time > 0 else 0, 2)
    
    print(json.dumps(timing_info, indent=2))

except Exception as e:
    print(json.dumps({'error': str(e)}, indent=2))
EOF
}

# Analyze workflow performance patterns
analyze_performance_patterns() {
    local timing_data="$1"
    local workflow_name="$2"
    
    log_info "Analyzing performance patterns: $workflow_name"
    
    python3 << EOF
import json

timing_info = json.loads('$timing_data')

patterns = {
    'performance_grade': 'F',
    'bottlenecks': [],
    'optimization_opportunities': [],
    'resource_efficiency': 'poor',
    'scalability_concerns': [],
    'recommendations': []
}

total_time = timing_info.get('total_estimated_time', 0)

# Performance grading
if total_time <= $PERFORMANCE_TARGET_EXCELLENT:
    patterns['performance_grade'] = 'A'
    patterns['resource_efficiency'] = 'excellent'
elif total_time <= $PERFORMANCE_TARGET_GOOD:
    patterns['performance_grade'] = 'B'
    patterns['resource_efficiency'] = 'good'
elif total_time <= $PERFORMANCE_TARGET_ACCEPTABLE:
    patterns['performance_grade'] = 'C'
    patterns['resource_efficiency'] = 'acceptable'
elif total_time <= $PERFORMANCE_TARGET_MAXIMUM:
    patterns['performance_grade'] = 'D'
    patterns['resource_efficiency'] = 'poor'
else:
    patterns['performance_grade'] = 'F'
    patterns['resource_efficiency'] = 'unacceptable'

# Identify bottlenecks
longest_job = timing_info.get('longest_job_time', 0)
if longest_job > 15:
    patterns['bottlenecks'].append(f'Long-running job detected ({longest_job} minutes)')

if timing_info.get('parallel_efficiency', 0) < 2:
    patterns['bottlenecks'].append('Poor parallel execution efficiency')

# Optimization opportunities
if not timing_info.get('has_caching', False):
    patterns['optimization_opportunities'].append('Implement dependency caching')

if timing_info.get('has_matrix', False):
    patterns['optimization_opportunities'].append('Review matrix strategy for efficiency')

if total_time > $PERFORMANCE_TARGET_GOOD:
    patterns['optimization_opportunities'].append('Consider job parallelization')

# Scalability concerns
if timing_info.get('max_parallel_jobs', 0) > 5:
    patterns['scalability_concerns'].append('High parallel job count may hit runner limits')

if total_time > $PERFORMANCE_TARGET_ACCEPTABLE:
    patterns['scalability_concerns'].append('Long execution time affects CI/CD velocity')

# Generate recommendations
if patterns['performance_grade'] in ['D', 'F']:
    patterns['recommendations'].append('URGENT: Optimize workflow performance')
    patterns['recommendations'].append('Break down large jobs into smaller units')
    patterns['recommendations'].append('Implement aggressive caching strategy')

if not timing_info.get('has_timeouts', False):
    patterns['recommendations'].append('Add timeout configuration to prevent hanging')

if patterns['resource_efficiency'] == 'poor':
    patterns['recommendations'].append('Review resource allocation and job distribution')

print(json.dumps(patterns, indent=2))
EOF
}

# Benchmark build and test performance
benchmark_build_performance() {
    local workflow_name="$1"
    
    log_info "Benchmarking build performance: $workflow_name"
    
    local build_start=$(date +%s)
    local build_results=()
    
    # Test build performance for web-dashboard (fastest to build)
    if command -v pnpm >/dev/null 2>&1; then
        log_info "Testing web-dashboard build performance..."
        
        local web_build_start=$(date +%s)
        if timeout 300 pnpm nx build web-dashboard >/dev/null 2>&1; then
            local web_build_end=$(date +%s)
            local web_build_time=$((web_build_end - web_build_start))
            build_results+=("web-dashboard:$web_build_time:success")
            log_success "Web dashboard build: ${web_build_time}s"
        else
            build_results+=("web-dashboard:300:timeout")
            log_warning "Web dashboard build: timeout"
        fi
    fi
    
    # Test lint performance
    log_info "Testing lint performance..."
    local lint_start=$(date +%s)
    if timeout 60 pnpm lint >/dev/null 2>&1; then
        local lint_end=$(date +%s)
        local lint_time=$((lint_end - lint_start))
        build_results+=("lint:$lint_time:success")
        log_success "Lint performance: ${lint_time}s"
    else
        build_results+=("lint:60:timeout")
        log_warning "Lint performance: timeout"
    fi
    
    # Test dependency installation (if not already installed)
    if [[ ! -d "node_modules" ]]; then
        log_info "Testing dependency installation performance..."
        local deps_start=$(date +%s)
        if timeout 300 pnpm install --frozen-lockfile >/dev/null 2>&1; then
            local deps_end=$(date +%s)
            local deps_time=$((deps_end - deps_start))
            build_results+=("dependencies:$deps_time:success")
            log_success "Dependency installation: ${deps_time}s"
        else
            build_results+=("dependencies:300:timeout")
            log_warning "Dependency installation: timeout"
        fi
    fi
    
    local build_end=$(date +%s)
    local total_benchmark_time=$((build_end - build_start))
    
    echo "${build_results[@]} total:$total_benchmark_time"
}

# Measure resource usage patterns
measure_resource_usage() {
    local workflow_name="$1"
    
    log_info "Measuring resource usage patterns: $workflow_name"
    
    python3 << EOF
import os
import json
import subprocess

def get_disk_usage():
    try:
        result = subprocess.run(['df', '-h', '.'], capture_output=True, text=True)
        lines = result.stdout.strip().split('\n')
        if len(lines) > 1:
            parts = lines[1].split()
            return {
                'total': parts[1],
                'used': parts[2],
                'available': parts[3],
                'use_percentage': parts[4]
            }
    except:
        pass
    return {'total': 'unknown', 'used': 'unknown', 'available': 'unknown', 'use_percentage': 'unknown'}

def get_memory_info():
    try:
        with open('/proc/meminfo', 'r') as f:
            meminfo = f.read()
        
        mem_total = None
        mem_available = None
        
        for line in meminfo.split('\n'):
            if line.startswith('MemTotal:'):
                mem_total = int(line.split()[1]) * 1024  # Convert from kB to bytes
            elif line.startswith('MemAvailable:'):
                mem_available = int(line.split()[1]) * 1024
        
        if mem_total and mem_available:
            used = mem_total - mem_available
            return {
                'total_gb': round(mem_total / (1024**3), 2),
                'used_gb': round(used / (1024**3), 2),
                'available_gb': round(mem_available / (1024**3), 2),
                'usage_percentage': round((used / mem_total) * 100, 1)
            }
    except:
        pass
    return {'total_gb': 0, 'used_gb': 0, 'available_gb': 0, 'usage_percentage': 0}

def get_cpu_info():
    try:
        with open('/proc/cpuinfo', 'r') as f:
            cpuinfo = f.read()
        
        cpu_count = cpuinfo.count('processor')
        
        # Get load average
        with open('/proc/loadavg', 'r') as f:
            load = f.read().split()
            load_1min = float(load[0])
            load_5min = float(load[1])
            load_15min = float(load[2])
        
        return {
            'cpu_count': cpu_count,
            'load_1min': load_1min,
            'load_5min': load_5min,
            'load_15min': load_15min,
            'load_percentage': round((load_1min / cpu_count) * 100, 1) if cpu_count > 0 else 0
        }
    except:
        pass
    return {'cpu_count': 0, 'load_1min': 0, 'load_5min': 0, 'load_15min': 0, 'load_percentage': 0}

resource_usage = {
    'timestamp': '$(date -Iseconds)',
    'disk': get_disk_usage(),
    'memory': get_memory_info(),
    'cpu': get_cpu_info(),
    'node_modules_size': 'unknown'
}

# Get node_modules size if it exists
try:
    result = subprocess.run(['du', '-sh', 'node_modules'], capture_output=True, text=True)
    if result.returncode == 0:
        resource_usage['node_modules_size'] = result.stdout.split()[0]
except:
    pass

print(json.dumps(resource_usage, indent=2))
EOF
}

# Run comprehensive performance benchmark
run_performance_benchmark() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    local report_file="$REPORTS_DIR/benchmark-$workflow_name-$TIMESTAMP.json"
    
    log_header "Running performance benchmark: $workflow_name"
    
    local benchmark_start=$(date +%s)
    
    # Extract timing information
    local timing_data
    timing_data=$(extract_workflow_timings "$workflow_file")
    
    if [[ $? -ne 0 ]]; then
        log_error "Failed to extract timing information: $workflow_name"
        return 1
    fi
    
    # Analyze performance patterns
    local performance_patterns
    performance_patterns=$(analyze_performance_patterns "$timing_data" "$workflow_name")
    
    # Benchmark actual build performance
    local build_benchmark
    build_benchmark=$(benchmark_build_performance "$workflow_name")
    
    # Measure current resource usage
    local resource_usage
    resource_usage=$(measure_resource_usage "$workflow_name")
    
    local benchmark_end=$(date +%s)
    local benchmark_duration=$((benchmark_end - benchmark_start))
    
    # Determine performance category
    local estimated_time=$(echo "$timing_data" | python3 -c "import json, sys; print(json.load(sys.stdin).get('total_estimated_time', 0))")
    
    if (( $(echo "$estimated_time <= $PERFORMANCE_TARGET_EXCELLENT" | bc -l) )); then
        ((EXCELLENT_PERFORMANCE++))
    elif (( $(echo "$estimated_time <= $PERFORMANCE_TARGET_GOOD" | bc -l) )); then
        ((GOOD_PERFORMANCE++))
    elif (( $(echo "$estimated_time <= $PERFORMANCE_TARGET_ACCEPTABLE" | bc -l) )); then
        ((ACCEPTABLE_PERFORMANCE++))
    else
        ((POOR_PERFORMANCE++))
    fi
    
    # Generate comprehensive benchmark report
    cat > "$report_file" << EOF
{
  "workflow_name": "$workflow_name",
  "workflow_file": "$workflow_file",
  "benchmark_timestamp": "$(date -Iseconds)",
  "benchmark_duration_seconds": $benchmark_duration,
  "timing_analysis": $timing_data,
  "performance_patterns": $performance_patterns,
  "build_benchmark": {
    "results": ["${build_benchmark// /\", \"}"]
  },
  "resource_usage": $resource_usage,
  "performance_targets": {
    "excellent": $PERFORMANCE_TARGET_EXCELLENT,
    "good": $PERFORMANCE_TARGET_GOOD,
    "acceptable": $PERFORMANCE_TARGET_ACCEPTABLE,
    "maximum": $PERFORMANCE_TARGET_MAXIMUM
  }
}
EOF
    
    log_success "Performance benchmark completed: $workflow_name (${benchmark_duration}s)"
    ((TOTAL_BENCHMARKS++))
    
    return 0
}

# Benchmark all workflows
benchmark_all_workflows() {
    log_header "Starting comprehensive workflow performance benchmarking"
    
    local active_workflows=(
        "enterprise-ci.yml"
        "staging-workflow.yml"
        "production-workflow.yml"
        "security-enhanced.yml"
        "dependency-health.yml"
        "mcp-index.yml"
        "devcontainer-validation.yml"
    )
    
    log_info "Found ${#active_workflows[@]} workflows to benchmark"
    
    for workflow in "${active_workflows[@]}"; do
        local workflow_file="$WORKFLOW_DIR/$workflow"
        
        if [[ -f "$workflow_file" ]]; then
            run_performance_benchmark "$workflow_file"
        else
            log_error "Workflow file not found: $workflow_file"
        fi
        
        echo ""
    done
}

# Generate performance summary
generate_performance_summary() {
    local summary_file="$REPORTS_DIR/performance-summary-$TIMESTAMP.json"
    
    log_header "Generating workflow performance summary"
    
    # Calculate performance distribution
    local excellent_percentage=0
    local good_percentage=0
    local acceptable_percentage=0
    local poor_percentage=0
    
    if [[ $TOTAL_BENCHMARKS -gt 0 ]]; then
        excellent_percentage=$(( (EXCELLENT_PERFORMANCE * 100) / TOTAL_BENCHMARKS ))
        good_percentage=$(( (GOOD_PERFORMANCE * 100) / TOTAL_BENCHMARKS ))
        acceptable_percentage=$(( (ACCEPTABLE_PERFORMANCE * 100) / TOTAL_BENCHMARKS ))
        poor_percentage=$(( (POOR_PERFORMANCE * 100) / TOTAL_BENCHMARKS ))
    fi
    
    # Determine overall performance grade
    local overall_grade="F"
    if [[ $excellent_percentage -ge 70 ]]; then
        overall_grade="A"
    elif [[ $good_percentage -ge 50 ]]; then
        overall_grade="B"
    elif [[ $acceptable_percentage -ge 50 ]]; then
        overall_grade="C"
    elif [[ $poor_percentage -lt 80 ]]; then
        overall_grade="D"
    fi
    
    # Generate summary JSON
    cat > "$summary_file" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "total_benchmarks": $TOTAL_BENCHMARKS,
  "overall_performance_grade": "$overall_grade",
  "performance_distribution": {
    "excellent": $EXCELLENT_PERFORMANCE,
    "good": $GOOD_PERFORMANCE,
    "acceptable": $ACCEPTABLE_PERFORMANCE,
    "poor": $POOR_PERFORMANCE
  },
  "performance_percentages": {
    "excellent": $excellent_percentage,
    "good": $good_percentage,
    "acceptable": $acceptable_percentage,
    "poor": $poor_percentage
  },
  "performance_targets": {
    "excellent_minutes": $PERFORMANCE_TARGET_EXCELLENT,
    "good_minutes": $PERFORMANCE_TARGET_GOOD,
    "acceptable_minutes": $PERFORMANCE_TARGET_ACCEPTABLE,
    "maximum_minutes": $PERFORMANCE_TARGET_MAXIMUM
  },
  "recommendations": []
}
EOF
    
    # Add recommendations based on performance
    if [[ $poor_percentage -gt 30 ]]; then
        echo "    \"URGENT: Optimize poor-performing workflows\"," >> "$summary_file"
    fi
    
    if [[ $overall_grade == "D" || $overall_grade == "F" ]]; then
        echo "    \"Implement comprehensive performance optimization\"," >> "$summary_file"
    fi
    
    if [[ $excellent_percentage -lt 30 ]]; then
        echo "    \"Focus on achieving excellent performance targets\"," >> "$summary_file"
    fi
    
    log_success "Performance summary generated: $summary_file"
    
    # Display summary
    echo ""
    log_header "WORKFLOW PERFORMANCE SUMMARY"
    echo "============================="
    log_info "Overall Performance Grade: $overall_grade"
    log_info "Total Workflows Benchmarked: $TOTAL_BENCHMARKS"
    echo ""
    log_info "Performance Distribution:"
    log_success "🚀 Excellent (<${PERFORMANCE_TARGET_EXCELLENT}m): $EXCELLENT_PERFORMANCE ($excellent_percentage%)"
    log_success "✅ Good (<${PERFORMANCE_TARGET_GOOD}m): $GOOD_PERFORMANCE ($good_percentage%)"
    log_warning "⚠️  Acceptable (<${PERFORMANCE_TARGET_ACCEPTABLE}m): $ACCEPTABLE_PERFORMANCE ($acceptable_percentage%)"
    log_error "❌ Poor (>${PERFORMANCE_TARGET_ACCEPTABLE}m): $POOR_PERFORMANCE ($poor_percentage%)"
    echo ""
    
    if [[ $overall_grade == "A" ]]; then
        log_success "🎉 Excellent overall performance - workflows are well-optimized"
    elif [[ $overall_grade == "B" ]]; then
        log_success "👍 Good overall performance - minor optimizations possible"
    elif [[ $overall_grade == "C" ]]; then
        log_warning "⚠️  Acceptable performance - optimization recommended"
    else
        log_error "🚨 Poor performance - immediate optimization required"
    fi
    
    log_info "📊 Detailed performance reports available in: $REPORTS_DIR"
    
    return $([[ $overall_grade == "A" || $overall_grade == "B" ]] && echo 0 || echo 1)
}

# Main execution function
main() {
    echo ""
    log_header "CI/CD WORKFLOW PERFORMANCE BENCHMARK"
    log_header "Execution Timing and Optimization Analysis"
    echo "============================================="
    log_info "Benchmark started: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    log_info "Project root: $PROJECT_ROOT"
    log_info "Workflow directory: $WORKFLOW_DIR"
    echo ""
    
    # Check dependencies
    if ! command -v python3 >/dev/null 2>&1; then
        log_error "Python 3 is required for performance analysis"
        exit 1
    fi
    
    if ! command -v bc >/dev/null 2>&1; then
        log_error "bc (calculator) is required for performance calculations"
        exit 1
    fi
    
    # Initialize
    init_reports
    
    # Run benchmarks
    benchmark_all_workflows
    
    # Generate summary
    generate_performance_summary
    
    echo ""
    log_info "Benchmark completed: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    log_info "⚡ Workflow performance analysis complete!"
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [--help]"
        echo ""
        echo "CI/CD Workflow Performance Benchmark"
        echo ""
        echo "This script analyzes workflow execution performance, timing,"
        echo "and provides optimization recommendations."
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help message"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac