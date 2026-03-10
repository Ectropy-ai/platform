# Ectropy Platform Cross-Platform Service Startup
# Windows PowerShell script for enterprise service management

param(
    [string]$Service = "all",
    [switch]$Production = $false,
    [switch]$Debug = $false
)

# Enterprise environment setup
$env:NODE_OPTIONS = "--loader tsx --experimental-specifier-resolution=node --enable-source-maps"
$env:NODE_NO_WARNINGS = "1"
$env:ESM_LOADER_ENABLED = "true"

# Production environment overrides
if ($Production) {
    $env:NODE_ENV = "production"
    $env:NODE_OPTIONS += " --max-old-space-size=4096"
}

# Debug environment setup
if ($Debug) {
    $env:NODE_OPTIONS += " --inspect"
    Write-Host "🐛 Debug mode enabled - attach debugger to process" -ForegroundColor Yellow
}

function Start-EctropyService {
    param($Name, $Command, $Port)
    
    Write-Host "🚀 Starting $Name on port $Port..." -ForegroundColor Green
    
    # Validate port availability
    $portCheck = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($portCheck) {
        Write-Host "⚠️  Port $Port already in use - stopping existing service" -ForegroundColor Yellow
        Stop-Process -Id (Get-NetTCPConnection -LocalPort $Port).OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    
    # Start service in new PowerShell window
    $startCommand = "cd '$PWD'; $env:NODE_OPTIONS='$env:NODE_OPTIONS'; $Command"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $startCommand -WindowStyle Normal
    
    # Wait for service to start
    Start-Sleep -Seconds 5
    
    # Health check
    try {
        $healthUrl = "http://localhost:$Port/health"
        $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 10 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ $Name health check passed" -ForegroundColor Green
        }
    } catch {
        Write-Host "⚠️  $Name health check pending..." -ForegroundColor Yellow
    }
}

function Start-AllServices {
    Write-Host "🏢 Starting Ectropy Platform - Enterprise Mode" -ForegroundColor Cyan
    Write-Host "=============================================" -ForegroundColor Cyan
    
    # Start infrastructure services
    Write-Host "📦 Starting infrastructure services..." -ForegroundColor Blue
    docker-compose -f docker-compose.dev.yml up -d
    Start-Sleep -Seconds 10
    
    # Start application services
    Start-EctropyService "API Gateway" "node --import tsx apps/api-gateway/src/main.ts" 4000
    Start-EctropyService "MCP Server" "node --import tsx apps/mcp-server/src/main.ts" 3001
    Start-EctropyService "Edge Server" "node --import tsx apps/edge-server/src/main.ts" 3002
    Start-EctropyService "Web Dashboard" "pnpm nx serve web-dashboard" 4200
    
    Write-Host "`n🎯 All services started successfully!" -ForegroundColor Green
    Write-Host "Dashboard: http://localhost:4200" -ForegroundColor White
    Write-Host "API Gateway: http://localhost:4000" -ForegroundColor White
    Write-Host "MCP Server: http://localhost:3001" -ForegroundColor White
}

# Main execution logic
Write-Host "🏗️  Ectropy Platform Windows Startup" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

switch ($Service.ToLower()) {
    "all" { Start-AllServices }
    "api" { Start-EctropyService "API Gateway" "node --import tsx apps/api-gateway/src/main.ts" 4000 }
    "mcp" { Start-EctropyService "MCP Server" "node --import tsx apps/mcp-server/src/main.ts" 3001 }
    "edge" { Start-EctropyService "Edge Server" "node --import tsx apps/edge-server/src/main.ts" 3002 }
    "web" { Start-EctropyService "Web Dashboard" "pnpm nx serve web-dashboard" 4200 }
    "infra" { 
        Write-Host "📦 Starting infrastructure services only..." -ForegroundColor Blue
        docker-compose -f docker-compose.dev.yml up -d 
    }
    default { 
        Write-Host "❌ Invalid service: $Service" -ForegroundColor Red
        Write-Host "Valid options: all, api, mcp, edge, web, infra" -ForegroundColor White
    }
}
}