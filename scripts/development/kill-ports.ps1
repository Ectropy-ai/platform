# PowerShell script to kill processes running on conflicting ports
# Used for Dev AI Agents to resolve port conflicts

$ports = @(4000, 3001, 4200)

Write-Host "🔧 Killing processes on conflicting ports..." -ForegroundColor Cyan

foreach ($port in $ports) {
    try {
        $process = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($process) {
            Stop-Process -Id $process.OwningProcess -Force -ErrorAction SilentlyContinue
            Write-Host "✅ Killed process on port $port" -ForegroundColor Green
        } else {
            Write-Host "ℹ️  No process found on port $port" -ForegroundColor Gray
        }
    } catch {
        Write-Host "⚠️  Could not check/kill process on port $port : $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host "🎯 Port cleanup completed!" -ForegroundColor Green