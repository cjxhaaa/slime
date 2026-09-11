<#
  Builds Slime with your Google OAuth client compiled in, so the finished app shows a single
  Connect button instead of asking anyone to paste credentials.

  Reads google-client.json next to this script if it exists, otherwise asks once and offers to
  save it. That file is gitignored — the credentials never leave this machine.

  Usage:  right-click -> Run with PowerShell     (or)     pwsh scripts\build-with-google.ps1
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $PSScriptRoot 'google-client.json'

if (Test-Path $configPath) {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  Write-Host "Using credentials from scripts\google-client.json" -ForegroundColor DarkGray
} else {
  Write-Host ""
  Write-Host "No saved credentials yet. Paste them from the Google Cloud console" -ForegroundColor Cyan
  Write-Host "(Google Auth Platform -> Clients -> your Desktop app client)." -ForegroundColor DarkGray
  Write-Host ""
  $clientId = Read-Host "Client ID"
  $clientSecret = Read-Host "Client secret (press Enter to skip)"
  $config = [pscustomobject]@{ client_id = $clientId.Trim(); client_secret = $clientSecret.Trim() }

  if ((Read-Host "Save these to scripts\google-client.json for next time? (y/N)") -match '^[Yy]') {
    $config | ConvertTo-Json | Set-Content -Path $configPath -Encoding utf8
    Write-Host "Saved. It is gitignored." -ForegroundColor DarkGray
  }
}

if ([string]::IsNullOrWhiteSpace($config.client_id)) {
  Write-Error "A client ID is required."
}

# option_env! in src-tauri/src/store.rs reads these at compile time.
$env:SLIME_GOOGLE_CLIENT_ID = $config.client_id
$env:SLIME_GOOGLE_CLIENT_SECRET = $config.client_secret

Write-Host ""
Write-Host "Building with client $($config.client_id.Substring(0, [Math]::Min(24, $config.client_id.Length)))…" -ForegroundColor Cyan
Push-Location $root
try {
  # `option_env!` is resolved at compile time but does not register an env-var dependency with
  # cargo, so changing the credentials alone will not trigger a rebuild and the previous client
  # would be silently reused. Touching the file that reads them forces just that crate to
  # recompile — `cargo clean` also works but throws away gigabytes of unrelated cache.
  (Get-Item 'src-tauri\src\store.rs').LastWriteTime = Get-Date

  # Native stderr is deliberately not redirected. Under $ErrorActionPreference = 'Stop', piping a
  # native command's stderr wraps each line in an ErrorRecord and aborts the script — which is how
  # an earlier version of this script died on `cargo clean` printing "Removed N files" to stderr,
  # having already deleted the cache but before ever starting the build.
  npm run tauri build
  if ($LASTEXITCODE -ne 0) { Write-Error "tauri build failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$installer = Join-Path $root 'src-tauri\target\release\bundle\nsis'
Write-Host ""
Write-Host "Done. Installer is in:" -ForegroundColor Green
Write-Host "  $installer"
