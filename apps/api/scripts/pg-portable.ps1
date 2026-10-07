# Local PostgreSQL 16 without Docker or admin rights (Windows).
# Uses the EDB binaries zip unpacked to $env:LOCALAPPDATA\pgsql16 (see README, "API (apps/api)").
# Same user, password and databases as docker-compose.yml, listening on localhost only.
#
#   .\scripts\pg-portable.ps1 init     # once: create the data folder and databases
#   .\scripts\pg-portable.ps1 start    # after each reboot
#   .\scripts\pg-portable.ps1 stop
#   .\scripts\pg-portable.ps1 status

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("init", "start", "stop", "status")]
    [string]$Action
)

$ErrorActionPreference = "Stop"
$PgHome = if ($env:PG_HOME) { $env:PG_HOME } else { Join-Path $env:LOCALAPPDATA "pgsql16" }
$PgData = if ($env:PG_DATA) { $env:PG_DATA } else { Join-Path $env:LOCALAPPDATA "pgsql16-data" }
$PgUser = "helpverified"
$PgPassword = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "helpverified" } # local dev only
$Bin = Join-Path $PgHome "bin"
$LogFile = Join-Path $PgData "server.log"

if (-not (Test-Path (Join-Path $Bin "pg_ctl.exe"))) {
    throw "PostgreSQL binaries not found in $PgHome. Unzip the EDB 'binaries' zip there, or set PG_HOME."
}

switch ($Action) {
    "init" {
        if (Test-Path (Join-Path $PgData "PG_VERSION")) { throw "Already initialised: $PgData" }
        $pwFile = New-TemporaryFile
        try {
            Set-Content -Path $pwFile -Value $PgPassword -NoNewline -Encoding ascii
            & (Join-Path $Bin "initdb.exe") -D $PgData -U $PgUser --pwfile=$pwFile --auth=scram-sha-256 --encoding=UTF8 --locale=C
            if ($LASTEXITCODE -ne 0) { throw "initdb failed" }
        } finally {
            Remove-Item $pwFile -Force
        }
        & (Join-Path $Bin "pg_ctl.exe") -D $PgData -l $LogFile -o "-c listen_addresses=localhost" start -w
        $env:PGPASSWORD = $PgPassword
        foreach ($db in "helpverified", "helpverified_test") {
            & (Join-Path $Bin "createdb.exe") -h localhost -U $PgUser $db
            if ($LASTEXITCODE -ne 0) { throw "createdb $db failed" }
        }
        Write-Output "Initialised $PgData with databases helpverified and helpverified_test."
    }
    "start" {
        & (Join-Path $Bin "pg_ctl.exe") -D $PgData -l $LogFile -o "-c listen_addresses=localhost" start -w
    }
    "stop" {
        & (Join-Path $Bin "pg_ctl.exe") -D $PgData stop -m fast
    }
    "status" {
        & (Join-Path $Bin "pg_ctl.exe") -D $PgData status
    }
}
