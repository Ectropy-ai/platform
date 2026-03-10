<#
.SYNOPSIS
    Infrastructure Validation Test Suite for Ectropy Speckle Integration

.DESCRIPTION
    Comprehensive test suite to validate:
    - Container deployment status
    - Network connectivity
    - Database migrations
    - Configuration correctness
    - Security settings
    - API endpoints

.NOTES
    File: scripts/testing/infrastructure-validation.test.ps1
    Author: Enterprise Integration Team
    Date: 2025-11-14
    Version: 1.0.0

.EXAMPLE
    .\scripts\testing\infrastructure-validation.test.ps1

.EXAMPLE
    .\scripts\testing\infrastructure-validation.test.ps1 -Verbose
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [switch]$SkipContainerTests = $false,

    [Parameter(Mandatory=$false)]
    [switch]$SkipDatabaseTests = $false,

    [Parameter(Mandatory=$false)]
    [switch]$SkipNetworkTests = $false,

    [Parameter(Mandatory=$false)]
    [switch]$SkipApiTests = $false,

    [Parameter(Mandatory=$false)]
    [string]$ReportPath = "test-results/infrastructure-validation-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').json"
)

# Initialize test results
$script:TestResults = @{
    timestamp = Get-Date -Format "o"
    environment = "development"
    totalTests = 0
    passed = 0
    failed = 0
    skipped = 0
    tests = @()
}

# Helper function to record test result
function Record-TestResult {
    param(
        [string]$Category,
        [string]$Name,
        [string]$Status,  # "PASS", "FAIL", "SKIP"
        [string]$Expected,
        [string]$Actual,
        [string]$Message = "",
        [object]$Details = $null
    )

    $script:TestResults.totalTests++

    switch ($Status) {
        "PASS" { $script:TestResults.passed++; $symbol = "✅" }
        "FAIL" { $script:TestResults.failed++; $symbol = "❌" }
        "SKIP" { $script:TestResults.skipped++; $symbol = "⏭️" }
    }

    $result = @{
        category = $Category
        name = $Name
        status = $Status
        expected = $Expected
        actual = $Actual
        message = $Message
        details = $Details
    }

    $script:TestResults.tests += $result

    # Console output
    $color = if ($Status -eq "PASS") { "Green" } elseif ($Status -eq "FAIL") { "Red" } else { "Yellow" }
    Write-Host "$symbol [$Category] $Name" -ForegroundColor $color
    if ($Message) {
        Write-Host "   $Message" -ForegroundColor Gray
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "ECTROPY INFRASTRUCTURE VALIDATION TESTS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ============================================
# TEST CATEGORY 1: CONTAINER DEPLOYMENT
# ============================================

if (-not $SkipContainerTests) {
    Write-Host "`n[CATEGORY] Container Deployment Status" -ForegroundColor Yellow

    $expectedContainers = @(
        @{ Name = "ectropy-postgres-1"; RequiredStatus = "running"; RequiredHealth = "healthy" }
        @{ Name = "ectropy-redis-1"; RequiredStatus = "running"; RequiredHealth = "healthy" }
        @{ Name = "ectropy-minio"; RequiredStatus = "running"; RequiredHealth = "healthy" }
        @{ Name = "ectropy-web-dashboard-1"; RequiredStatus = "running"; RequiredHealth = "healthy" }
        @{ Name = "ectropy-speckle-server"; RequiredStatus = "running"; RequiredHealth = "any" }
        @{ Name = "ectropy-speckle-frontend"; RequiredStatus = "running"; RequiredHealth = "any" }
        @{ Name = "ectropy-speckle-preview"; RequiredStatus = "running"; RequiredHealth = "any" }
        @{ Name = "ectropy-speckle-webhook"; RequiredStatus = "running"; RequiredHealth = "any" }
    )

    foreach ($container in $expectedContainers) {
        $dockerPs = docker ps --format "{{.Names}}|{{.Status}}" --filter "name=$($container.Name)" 2>&1

        if ($dockerPs -match "^$($container.Name)\|(.+)$") {
            $status = $Matches[1]
            $isRunning = $status -match "Up"

            if ($container.RequiredHealth -eq "healthy") {
                $isHealthy = $status -match "healthy"
                if ($isRunning -and $isHealthy) {
                    Record-TestResult -Category "Container" -Name "$($container.Name) is running and healthy" `
                        -Status "PASS" -Expected "running + healthy" -Actual $status
                } elseif ($isRunning) {
                    Record-TestResult -Category "Container" -Name "$($container.Name) is running and healthy" `
                        -Status "FAIL" -Expected "running + healthy" -Actual $status `
                        -Message "Container running but not healthy"
                } else {
                    Record-TestResult -Category "Container" -Name "$($container.Name) is running and healthy" `
                        -Status "FAIL" -Expected "running + healthy" -Actual $status `
                        -Message "Container not running"
                }
            } else {
                # Just check running status
                if ($isRunning) {
                    Record-TestResult -Category "Container" -Name "$($container.Name) is running" `
                        -Status "PASS" -Expected "running" -Actual $status
                } else {
                    Record-TestResult -Category "Container" -Name "$($container.Name) is running" `
                        -Status "FAIL" -Expected "running" -Actual $status
                }
            }
        } else {
            Record-TestResult -Category "Container" -Name "$($container.Name) exists" `
                -Status "FAIL" -Expected "container exists" -Actual "not found" `
                -Message "Container not found - deployment incomplete"
        }
    }

    # Test: No port conflicts
    $portConflicts = docker ps --format "{{.Names}}|{{.Ports}}" | Where-Object { $_ -match "0\.0\.0\.0:3000.*ectropy-speckle-server" }
    if (-not $portConflicts) {
        Record-TestResult -Category "Container" -Name "No port 3000 conflict on speckle-server" `
            -Status "PASS" -Expected "no external port 3000" -Actual "no conflict" `
            -Message "Port 3000 correctly reserved for web-dashboard only"
    } else {
        Record-TestResult -Category "Container" -Name "No port 3000 conflict on speckle-server" `
            -Status "FAIL" -Expected "no external port 3000" -Actual "conflict detected" `
            -Message "speckle-server should not bind to external port 3000"
    }
}

# ============================================
# TEST CATEGORY 2: DATABASE VALIDATION
# ============================================

if (-not $SkipDatabaseTests) {
    Write-Host "`n[CATEGORY] Database Configuration" -ForegroundColor Yellow

    # Test: Speckle database exists
    $speckleDbCheck = docker exec ectropy-postgres-1 psql -U postgres -c "\l speckle" 2>&1
    if ($speckleDbCheck -match "speckle") {
        Record-TestResult -Category "Database" -Name "Speckle database exists" `
            -Status "PASS" -Expected "database 'speckle' exists" -Actual "found"
    } else {
        Record-TestResult -Category "Database" -Name "Speckle database exists" `
            -Status "FAIL" -Expected "database 'speckle' exists" -Actual "not found" `
            -Message "Run: docker exec ectropy-postgres-1 psql -U postgres -c 'CREATE DATABASE speckle;'"
    }

    # Test: Ectropy dev database exists
    $ectropyDbCheck = docker exec ectropy-postgres-1 psql -U postgres -c "\l ectropy_dev" 2>&1
    if ($ectropyDbCheck -match "ectropy_dev") {
        Record-TestResult -Category "Database" -Name "Ectropy dev database exists" `
            -Status "PASS" -Expected "database 'ectropy_dev' exists" -Actual "found"
    } else {
        Record-TestResult -Category "Database" -Name "Ectropy dev database exists" `
            -Status "FAIL" -Expected "database 'ectropy_dev' exists" -Actual "not found"
    }

    # Test: speckle_streams table exists
    $streamsTableCheck = docker exec ectropy-postgres-1 psql -U postgres -d ectropy_dev -c "\dt speckle_streams" 2>&1
    if ($streamsTableCheck -match "speckle_streams") {
        Record-TestResult -Category "Database" -Name "speckle_streams table exists" `
            -Status "PASS" -Expected "table exists" -Actual "found"
    } else {
        Record-TestResult -Category "Database" -Name "speckle_streams table exists" `
            -Status "FAIL" -Expected "table exists" -Actual "not found" `
            -Message "Migration 003 may not have run successfully"
    }

    # Test: speckle_sync_logs table exists
    $logsTableCheck = docker exec ectropy-postgres-1 psql -U postgres -d ectropy_dev -c "\dt speckle_sync_logs" 2>&1
    if ($logsTableCheck -match "speckle_sync_logs") {
        Record-TestResult -Category "Database" -Name "speckle_sync_logs table exists" `
            -Status "PASS" -Expected "table exists" -Actual "found"
    } else {
        Record-TestResult -Category "Database" -Name "speckle_sync_logs table exists" `
            -Status "FAIL" -Expected "table exists" -Actual "not found" `
            -Message "Migration 003 may not have run successfully"
    }

    # Test: RLS policies exist
    $rlsPolicyCheck = docker exec ectropy-postgres-1 psql -U postgres -d ectropy_dev -c "SELECT COUNT(*) FROM pg_policies WHERE tablename LIKE 'speckle%';" 2>&1
    if ($rlsPolicyCheck -match "\s+(\d+)") {
        $policyCount = [int]$Matches[1]
        if ($policyCount -ge 2) {
            Record-TestResult -Category "Database" -Name "RLS policies exist for speckle tables" `
                -Status "PASS" -Expected "2 policies" -Actual "$policyCount policies"
        } else {
            Record-TestResult -Category "Database" -Name "RLS policies exist for speckle tables" `
                -Status "FAIL" -Expected "2 policies" -Actual "$policyCount policies" `
                -Message "project_members table may be missing" `
                -Details @{ reason = "RLS policies require project_members table" }
        }
    }

    # Test: project_members table exists (for RLS)
    $projectMembersCheck = docker exec ectropy-postgres-1 psql -U postgres -d ectropy_dev -c "\dt project_members" 2>&1
    if ($projectMembersCheck -match "project_members") {
        Record-TestResult -Category "Database" -Name "project_members table exists" `
            -Status "PASS" -Expected "table exists" -Actual "found"
    } else {
        Record-TestResult -Category "Database" -Name "project_members table exists" `
            -Status "FAIL" -Expected "table exists" -Actual "not found" `
            -Message "Required for RLS policies - needs migration" `
            -Details @{ priority = "MEDIUM"; impact = "Multi-tenancy RLS not enforced" }
    }
}

# ============================================
# TEST CATEGORY 3: NETWORK CONNECTIVITY
# ============================================

if (-not $SkipNetworkTests) {
    Write-Host "`n[CATEGORY] Network Connectivity" -ForegroundColor Yellow

    # Test: Port 8080 accessible (Speckle frontend)
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080" -Method Head -TimeoutSec 5 -ErrorAction Stop
        Record-TestResult -Category "Network" -Name "Speckle frontend port 8080 accessible" `
            -Status "PASS" -Expected "HTTP 200-299" -Actual "HTTP $($response.StatusCode)"
    } catch {
        # Frontend might return error without admin user, but should be accessible
        if ($_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            Record-TestResult -Category "Network" -Name "Speckle frontend port 8080 accessible" `
                -Status "PASS" -Expected "HTTP response" -Actual "HTTP $statusCode" `
                -Message "Frontend responding (admin user not yet created)"
        } else {
            Record-TestResult -Category "Network" -Name "Speckle frontend port 8080 accessible" `
                -Status "FAIL" -Expected "HTTP response" -Actual "connection refused" `
                -Message $_.Exception.Message
        }
    }

    # Test: Port 9000 accessible (MinIO S3)
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9000/minio/health/live" -Method Get -TimeoutSec 5 -ErrorAction Stop
        Record-TestResult -Category "Network" -Name "MinIO S3 API port 9000 accessible" `
            -Status "PASS" -Expected "HTTP 200" -Actual "HTTP $($response.StatusCode)"
    } catch {
        Record-TestResult -Category "Network" -Name "MinIO S3 API port 9000 accessible" `
            -Status "FAIL" -Expected "HTTP 200" -Actual "connection error" `
            -Message $_.Exception.Message
    }

    # Test: Port 9001 accessible (MinIO Console)
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9001" -Method Head -TimeoutSec 5 -ErrorAction Stop
        Record-TestResult -Category "Network" -Name "MinIO Console port 9001 accessible" `
            -Status "PASS" -Expected "HTTP response" -Actual "HTTP $($response.StatusCode)"
    } catch {
        if ($_.Exception.Response.StatusCode) {
            Record-TestResult -Category "Network" -Name "MinIO Console port 9001 accessible" `
                -Status "PASS" -Expected "HTTP response" -Actual "HTTP $([int]$_.Exception.Response.StatusCode)"
        } else {
            Record-TestResult -Category "Network" -Name "MinIO Console port 9001 accessible" `
                -Status "FAIL" -Expected "HTTP response" -Actual "connection error"
        }
    }

    # Test: Port 3000 accessible (Web Dashboard)
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -Method Head -TimeoutSec 5 -ErrorAction Stop
        Record-TestResult -Category "Network" -Name "Web Dashboard port 3000 accessible" `
            -Status "PASS" -Expected "HTTP 200-299" -Actual "HTTP $($response.StatusCode)"
    } catch {
        if ($_.Exception.Response.StatusCode) {
            Record-TestResult -Category "Network" -Name "Web Dashboard port 3000 accessible" `
                -Status "PASS" -Expected "HTTP response" -Actual "HTTP $([int]$_.Exception.Response.StatusCode)"
        } else {
            Record-TestResult -Category "Network" -Name "Web Dashboard port 3000 accessible" `
                -Status "FAIL" -Expected "HTTP response" -Actual "connection error"
        }
    }

    # Test: Port 4000 accessible (API Gateway)
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:4000/health" -Method Get -TimeoutSec 5 -ErrorAction Stop
        Record-TestResult -Category "Network" -Name "API Gateway port 4000 accessible" `
            -Status "PASS" -Expected "HTTP 200" -Actual "HTTP $($response.StatusCode)"
    } catch {
        if ($_.Exception.Response.StatusCode) {
            Record-TestResult -Category "Network" -Name "API Gateway port 4000 accessible" `
                -Status "PASS" -Expected "HTTP response" -Actual "HTTP $([int]$_.Exception.Response.StatusCode)"
        } else {
            Record-TestResult -Category "Network" -Name "API Gateway port 4000 accessible" `
                -Status "FAIL" -Expected "HTTP response" -Actual "connection error"
        }
    }
}

# ============================================
# TEST CATEGORY 4: API ENDPOINTS
# ============================================

if (-not $SkipApiTests) {
    Write-Host "`n[CATEGORY] API Endpoints" -ForegroundColor Yellow

    # Test: API Gateway health endpoint
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:4000/health" -Method Get -TimeoutSec 10 -ErrorAction Stop
        if ($response.status -eq "ok" -or $response.healthy) {
            Record-TestResult -Category "API" -Name "API Gateway health check" `
                -Status "PASS" -Expected "healthy" -Actual "healthy" `
                -Details $response
        } else {
            Record-TestResult -Category "API" -Name "API Gateway health check" `
                -Status "FAIL" -Expected "healthy" -Actual $response.status `
                -Details $response
        }
    } catch {
        Record-TestResult -Category "API" -Name "API Gateway health check" `
            -Status "FAIL" -Expected "healthy" -Actual "error" `
            -Message $_.Exception.Message
    }

    # Test: Speckle health endpoint
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:4000/api/speckle/health" -Method Get -TimeoutSec 10 -ErrorAction Stop
        if ($response.status -eq "healthy" -or $response.configured) {
            Record-TestResult -Category "API" -Name "Speckle integration health check" `
                -Status "PASS" -Expected "configured" -Actual $response.status `
                -Details $response
        } else {
            Record-TestResult -Category "API" -Name "Speckle integration health check" `
                -Status "FAIL" -Expected "healthy/configured" -Actual $response.status `
                -Details $response
        }
    } catch {
        Record-TestResult -Category "API" -Name "Speckle integration health check" `
            -Status "FAIL" -Expected "healthy" -Actual "error" `
            -Message $_.Exception.Message
    }
}

# ============================================
# TEST CATEGORY 5: CONFIGURATION VALIDATION
# ============================================

Write-Host "`n[CATEGORY] Configuration Validation" -ForegroundColor Yellow

# Test: Environment file exists
if (Test-Path ".env.local") {
    Record-TestResult -Category "Config" -Name ".env.local file exists" `
        -Status "PASS" -Expected "file exists" -Actual "found"

    # Test: Critical Speckle env vars present
    $envContent = Get-Content ".env.local" -Raw

    $criticalVars = @(
        "SPECKLE_SERVER_URL",
        "SPECKLE_API_URL",
        "SPECKLE_SERVER_TOKEN",
        "ENABLE_SPECKLE_INTEGRATION"
    )

    foreach ($var in $criticalVars) {
        if ($envContent -match "$var=") {
            Record-TestResult -Category "Config" -Name "$var is configured" `
                -Status "PASS" -Expected "variable set" -Actual "found"
        } else {
            Record-TestResult -Category "Config" -Name "$var is configured" `
                -Status "FAIL" -Expected "variable set" -Actual "not found" `
                -Message "Required environment variable missing"
        }
    }

    # Test: Speckle token not placeholder
    if ($envContent -match "SPECKLE_SERVER_TOKEN=REPLACE_WITH_TOKEN") {
        Record-TestResult -Category "Config" -Name "SPECKLE_SERVER_TOKEN configured with real token" `
            -Status "FAIL" -Expected "real token" -Actual "placeholder" `
            -Message "Create Speckle admin user and generate token" `
            -Details @{ action = "Visit http://localhost:8080 to register admin" }
    } else {
        Record-TestResult -Category "Config" -Name "SPECKLE_SERVER_TOKEN configured with real token" `
            -Status "PASS" -Expected "real token" -Actual "configured"
    }
} else {
    Record-TestResult -Category "Config" -Name ".env.local file exists" `
        -Status "FAIL" -Expected "file exists" -Actual "not found" `
        -Message "Environment configuration missing"
}

# ============================================
# GENERATE REPORT
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Total Tests:  $($script:TestResults.totalTests)" -ForegroundColor White
Write-Host "Passed:       $($script:TestResults.passed)" -ForegroundColor Green
Write-Host "Failed:       $($script:TestResults.failed)" -ForegroundColor Red
Write-Host "Skipped:      $($script:TestResults.skipped)" -ForegroundColor Yellow

$passRate = [math]::Round(($script:TestResults.passed / $script:TestResults.totalTests) * 100, 1)
Write-Host "Pass Rate:    $passRate%" -ForegroundColor $(if ($passRate -ge 90) { "Green" } elseif ($passRate -ge 75) { "Yellow" } else { "Red" })

# Save detailed report
$reportDir = Split-Path -Parent $ReportPath
if (-not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$script:TestResults | ConvertTo-Json -Depth 10 | Set-Content $ReportPath
Write-Host "`nDetailed report saved to: $ReportPath" -ForegroundColor Cyan

# Show failed tests summary
if ($script:TestResults.failed -gt 0) {
    Write-Host "`n========================================" -ForegroundColor Red
    Write-Host "FAILED TESTS" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red

    $failedTests = $script:TestResults.tests | Where-Object { $_.status -eq "FAIL" }
    foreach ($test in $failedTests) {
        Write-Host "`n❌ [$($test.category)] $($test.name)" -ForegroundColor Red
        Write-Host "   Expected: $($test.expected)" -ForegroundColor Gray
        Write-Host "   Actual:   $($test.actual)" -ForegroundColor Gray
        if ($test.message) {
            Write-Host "   Message:  $($test.message)" -ForegroundColor Yellow
        }
        if ($test.details) {
            Write-Host "   Details:  $($test.details | ConvertTo-Json -Compress)" -ForegroundColor Gray
        }
    }
}

# Exit with appropriate code
exit $script:TestResults.failed
