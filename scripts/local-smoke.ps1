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

docker compose up -d postgres redis
try {
  $databaseReady = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      docker compose exec -T postgres pg_isready -U exact_location -d exact_location | Out-Null
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
  npm.cmd run db:seed
  docker compose up --build -d worker
  docker compose ps

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

      $firstCustomer = @($customers)[0]
      $customerDetail = Invoke-RestMethod -Uri "$ApiBaseUrl/v1/admin/customers/$($firstCustomer.id)" -Method Get -WebSession $webSession
      $firstAddress = @($customerDetail.addresses)[0]
      $createBody = @{ addressId = $firstAddress.id } | ConvertTo-Json
      $smokeStep = 'verification creation'
      $createdVerification = Invoke-RestMethod -Uri "$ApiBaseUrl/v1/admin/customers/$($firstCustomer.id)/verifications" -Method Post -ContentType 'application/json' -Body $createBody -WebSession $webSession
      $verificationToken = ([Uri]$createdVerification.verificationLink).Segments[-1]
      $smokeStep = 'public verification flow'
      $publicContext = Invoke-RestMethod -Uri "$ApiBaseUrl/v1/public/verifications/$verificationToken" -Method Get
      if ($publicContext.customer.phoneE164 -notmatch '\*') { throw 'Public context exposed an unmasked phone number.' }
      Invoke-RestMethod -Uri "$ApiBaseUrl/v1/public/verifications/$verificationToken/customer-confirmation" -Method Post -ContentType 'application/json' -Body (@{ confirmed = $true } | ConvertTo-Json) | Out-Null
      Invoke-RestMethod -Uri "$ApiBaseUrl/v1/public/verifications/$verificationToken/consent" -Method Post -ContentType 'application/json' | Out-Null
      foreach ($reminderPreference in @('IN_1_HOUR', 'TONIGHT', 'TOMORROW_MORNING')) {
        Invoke-RestMethod -Uri "$ApiBaseUrl/v1/public/verifications/$verificationToken/wait-for-home" -Method Post -ContentType 'application/json' -Body (@{ reminderPreference = $reminderPreference } | ConvertTo-Json) | Out-Null
      }
      $fourthReminderBlocked = $false
      try {
        Invoke-RestMethod -Uri "$ApiBaseUrl/v1/public/verifications/$verificationToken/wait-for-home" -Method Post -ContentType 'application/json' -Body (@{ reminderPreference = 'DEFAULT' } | ConvertTo-Json) | Out-Null
      } catch {
        $fourthReminderBlocked = $true
      }
      if (-not $fourthReminderBlocked) { throw 'Reminder limit smoke check failed: reminder #4 was accepted.' }
      Write-Host 'Public verification smoke check passed: masked context, confirmation, consent, reminder limit.'
    } catch {
      $detail = if ($_.ErrorDetails.Message) { " Response: $($_.ErrorDetails.Message)" } else { '' }
      throw "Backend API smoke check failed at [$smokeStep] on ${ApiBaseUrl}: $($_.Exception.Message).$detail"
    }
  } else {
    Write-Host 'API health check dilewati (-SkipApiCheck).'
  }
} finally {
  docker compose logs --tail=80 worker
}
