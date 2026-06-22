# ─── Switch Claude Code to Opus mode (direct AeroLink) ──────────────────────
# Run this before using Claude Opus. It configures Claude Code to talk
# directly to AeroLink's Anthropic API proxy (no local proxy needed).
#
# Usage: PowerShell -ExecutionPolicy Bypass .\scripts\set-opus-mode.ps1
# Then:  claude --model opus
# ────────────────────────────────────────────────────────────────────────────────

$AeroKey = $env:AEROLINK_API_KEY
if (-not $AeroKey) {
  # Try reading from .env
  $envFile = Join-Path $PSScriptRoot "..\.env"
  if (Test-Path $envFile) {
    $lines = Get-Content $envFile
    foreach ($line in $lines) {
      if ($line -match '^AEROLINK_API_KEY=(.+)') {
        $AeroKey = $matches[1].Trim()
        break
      }
    }
  }
}

if (-not $AeroKey) {
  Write-Host "ERROR: AEROLINK_API_KEY not found!" -ForegroundColor Red
  Write-Host "Set it in .env file or as an environment variable." -ForegroundColor Yellow
  exit 1
}

Write-Host "Switching to OPUS mode (direct AeroLink)..." -ForegroundColor Cyan
Write-Host ""

# Configure Claude Code for AeroLink direct connection
claude config set --global apiBaseUrl "https://capi.aerolink.lat"
claude config set --global apiKey "$AeroKey"

Write-Host ""
Write-Host "✅ Opus mode activated!" -ForegroundColor Green
Write-Host "   API Base: https://capi.aerolink.lat"
Write-Host "   Model:    Claude Opus 4.8"
Write-Host ""
Write-Host "Now run: claude --model opus" -ForegroundColor Yellow
Write-Host ""
Write-Host "To switch back to DeepSeek: .\scripts\set-deepseek-mode.ps1" -ForegroundColor Gray
