#!/bin/bash
# Runner Performance Benchmark Script
# Captures baseline metrics before/after upgrade for comparison

set -euo pipefail

RUNNER_IP="165.232.132.224"
SSH_KEY="~/.ssh/ectropy_runner"
OUTPUT_FILE="evidence/2025-12/runner-benchmark-$(date +%Y-%m-%d-%H%M).txt"

echo "═══════════════════════════════════════════════════════════"
echo "RUNNER PERFORMANCE BENCHMARK"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Output: ${OUTPUT_FILE}"
echo ""

mkdir -p evidence/2025-12

{
    echo "# Runner Performance Benchmark"
    echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo ""

    echo "## Droplet Information"
    doctl compute droplet get 521673004 --format ID,Name,Memory,VCPUs,Disk,Status,Size
    echo ""

    echo "## System Resources"
    ssh -i ${SSH_KEY} root@${RUNNER_IP} "
        echo '### CPU Information'
        lscpu | grep -E 'Model name|CPU\(s\)|Thread|Core|Socket'
        echo ''

        echo '### Memory'
        free -h
        echo ''

        echo '### Disk Usage'
        df -h | grep -E 'Filesystem|/dev/vda1'
        echo ''

        echo '### Load Average'
        uptime
        echo ''

        echo '### Top 10 Processes by CPU'
        ps aux --sort=-%cpu | head -11
        echo ''

        echo '### Top 10 Processes by Memory'
        ps aux --sort=-%mem | head -11
        echo ''
    "

    echo "## Runner Services Status"
    ssh -i ${SSH_KEY} root@${RUNNER_IP} "
        for service in \$(systemctl list-units 'actions.runner.*' --no-legend | awk '{print \$1}'); do
            echo \"### \$service\"
            systemctl status \$service --no-pager | head -10
            echo ''
        done
    "

    echo "## PNPM Store Size"
    ssh -i ${SSH_KEY} root@${RUNNER_IP} "
        echo '### Runner-specific stores'
        du -sh /opt/runner-cache/*/\.pnpm-store 2>/dev/null || echo 'No stores found'
        echo ''

        echo '### Total cache size'
        du -sh /opt/runner-cache 2>/dev/null || echo 'No cache directory'
        echo ''
    "

    echo "## GitHub Actions Runners"
    gh api repos/luhtech/Ectropy/actions/runners --jq '.runners[] | {name: .name, os: .os, status: .status, busy: .busy}' 2>/dev/null || echo "Unable to fetch runner status"
    echo ""

    echo "## Recent Workflow Runs"
    gh run list --limit 5 --json workflowName,status,conclusion,createdAt,updatedAt
    echo ""

} | tee "${OUTPUT_FILE}"

echo "═══════════════════════════════════════════════════════════"
echo "✅ Benchmark Complete"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Results saved to: ${OUTPUT_FILE}"
echo ""
echo "Use this to compare:"
echo "  Before upgrade: Current benchmark"
echo "  After upgrade: Run this script again"
echo "  After Phase 3: Run after matrix implementation"
echo ""
