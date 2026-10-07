# Local Redis 7 without Docker or admin rights (Windows).
# Uses the redis-windows project's msys2 zip (github.com/redis-windows/redis-windows, 7.4.x)
# unpacked to $env:LOCALAPPDATA\redis7 (see README, "API (apps/api)"). Same port as docker-compose.yml.
# Development only: no persistence (rate-limit windows and idempotency keys may be lost on stop).
#
#   .\scripts\redis-portable.ps1 start    # after each reboot
#   .\scripts\redis-portable.ps1 stop
#   .\scripts\redis-portable.ps1 status

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("start", "stop", "status")]
    [string]$Action
)

$ErrorActionPreference = "Stop"
$RedisHome = if ($env:REDIS_HOME) { $env:REDIS_HOME } else { Join-Path $env:LOCALAPPDATA "redis7" }
$Server = Join-Path $RedisHome "redis-server.exe"
$Cli = Join-Path $RedisHome "redis-cli.exe"

if (-not (Test-Path $Server)) {
    throw "Redis not found in $RedisHome. Unzip the redis-windows 7.4.x msys2 zip there, or set REDIS_HOME."
}

function Test-Running {
    # redis-cli writes "Connection refused" to stderr when Redis is down; PowerShell 5.1 raises that as an error.
    try { $reply = & $Cli -h 127.0.0.1 -p 6379 ping 2>$null } catch { return $false }
    return $reply -eq "PONG"
}

switch ($Action) {
    "start" {
        if (Test-Running) { Write-Output "Redis is already running on 127.0.0.1:6379."; return }
        Start-Process -FilePath $Server -WorkingDirectory $RedisHome -WindowStyle Hidden `
            -ArgumentList "--bind 127.0.0.1 ::1 --port 6379 --save `"`" --appendonly no"
        # Both loopbacks: "localhost" resolves to ::1 first, and Windows takes ~2 s to fall back to IPv4.
        foreach ($i in 1..20) {
            Start-Sleep -Milliseconds 250
            if (Test-Running) { Write-Output "Redis started on 127.0.0.1:6379."; return }
        }
        throw "Redis did not start."
    }
    "stop" {
        if (Test-Running) { & $Cli -h 127.0.0.1 -p 6379 shutdown nosave | Out-Null }
        Write-Output "Redis stopped."
    }
    "status" {
        if (Test-Running) { Write-Output "Redis is running on 127.0.0.1:6379." } else { Write-Output "Redis is not running." }
    }
}
