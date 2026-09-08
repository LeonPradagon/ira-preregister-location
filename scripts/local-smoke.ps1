param(
  [switch]$SkipApiCheck,
  [string]$AdminEmail = 'admin@example.com',
  [string]$AdminPassword = 'AdminLocalPassword123!',
  [int]$PostgresPort = 0,
  [string]$ApiBaseUrl = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'

if ($PostgresPort -le 0 -and $env:POSTGRES_PORT) {
  $PostgresPort = [int]$env:POSTGRES_PORT
}
if ($PostgresPort -le 0) {
  $serverEnvPath = Join-Path $PSScriptRoot '..\app\server\.env'
  if (Test-Path $serverEnvPath) {
    $databaseLine = Get-Content $serverEnvPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
    if ($databaseLine -and $databaseLine -match ':(\d+)/[^/]+$') {
      $PostgresPort = [int]$Matches[1]
    }
  }
}
if ($PostgresPort -le 0) { $PostgresPort = 5433 }
$env:POSTGRES_PORT = "$PostgresPort"

docker compose -p ira_preregist_dev -f docker-compose.dev.yml up -d postgres redis
try {
  $databaseReady = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      docker compose -p ira_preregist_dev -f docker-compose.dev.yml exec -T postgres pg_isready -U ira_preregist -d ira_preregist | Out-Null
    } catch {
      # The container may still be starting; inspect the native exit code below.
    }
    if ($LASTEXITCODE -eq 0) {
      $databaseReady = $true
      break
    }
    Start-Sleep -Seconds 1
  }

  if (-not $databaseReady) {
    throw 'PostgreSQL belum siap setelah 30 detik.'
  }

  npm.cmd run db:migrate
  if ($LASTEXITCODE -ne 0) { throw 'Migration gagal.' }
  npm.cmd run db:seed
  if ($LASTEXITCODE -ne 0) { throw 'Seed gagal.' }
  docker compose -p ira_preregist_dev -f docker-compose.dev.yml up --build -d worker
  docker compose -p ira_preregist_dev -f docker-compose.dev.yml ps

  if (-not $SkipApiCheck) {
    $smokeStep = 'health'
    try {
      $health = Invoke-RestMethod -Uri "$ApiBaseUrl/v1/health" -Method Get
      if ($health.status -ne 'ok') { throw "Health check returned an unexpected status: $($health.status)" }
      Write-Host "API health check passed: $($health.service)"

      $webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
      $authBody = @{ email = $AdminEmail; password = $AdminPassword; rememberMe = $false } | ConvertTo-Json
      $smokeStep = 'admin authentication'
      Invoke-RestMethod -Uri "$ApiBaseUrl/v1/api/auth/sign-in/email" -Method Post -ContentType 'application/json' -Body $authBody -WebSession $webSession | Out-Null
      $admin = Invoke-RestMethod -Uri "$ApiBaseUrl/v1/admin/me" -Method Get -WebSession $webSession
      if (-not $admin.id -or -not $admin.role) { throw 'Better Auth session smoke check returned an invalid admin identity.' }
      $smokeStep = 'admin data'
      $customers = Invoke-RestMethod -Uri "$ApiBaseUrl/v1/admin/customers" -Method Get -WebSession $webSession
      $settings = Invoke-RestMethod -Uri "$ApiBaseUrl/v1/admin/settings/validation" -Method Get -WebSession $webSession
      Invoke-RestMethod -Uri "$ApiBaseUrl/v1/admin/integrations" -Method Get -WebSession $webSession | Out-Null
      Invoke-RestMethod -Uri "$ApiBaseUrl/v1/admin/outbox" -Method Get -WebSession $webSession | Out-Null
      if ($null -eq $customers -or $null -eq $settings) { throw 'Admin data smoke check returned an empty response.' }
      Write-Host "Admin auth/API smoke check passed: $($admin.email) [$($admin.role)]"

    } catch {
      $detail = if ($_.ErrorDetails.Message) { " Response: $($_.ErrorDetails.Message)" } else { '' }
      throw "Backend API smoke check failed at [$smokeStep] on ${ApiBaseUrl}: $($_.Exception.Message).$detail"
    }
  } else {
    Write-Host 'API health check dilewati (-SkipApiCheck).'
  }
} finally {
  docker compose -p ira_preregist_dev -f docker-compose.dev.yml logs --tail=80 worker
}
