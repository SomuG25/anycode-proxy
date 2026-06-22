# ─── Switch Claude Code to DeepSeek mode (via local proxy) ─────────────────
# Run this before using DeepSeek. It configures Claude Code to talk
# through the local proxy (port 4141) to Command Code's free API.
#
# Usage: PowerShell -ExecutionPolicy Bypass .\scripts\set-deepseek-mode.ps1
# Then:  claude --model deepseek
#
# Make sure the proxy is running: node index.js
# ────────────────────────────────────────────────────────────────────────────────

Write-Host "Switching to DEEPSEEK mode (via local proxy)..." -ForegroundColor Cyan
Write-Host ""

# Configure Claude Code for local proxy
claude config set --global apiBaseUrl "http://localhost:4141"
claude config set --global apiKey "sk-proxy"

Write-Host ""
Write-Host "✅ DeepSeek mode activated!" -ForegroundColor Green
Write-Host "   API Base: http://localhost:4141"
Write-Host "   Model:    DeepSeek V4 Pro (free via Command Code)"
Write-Host ""
Write-Host "Make sure the proxy is running in another terminal:" -ForegroundColor Yellow
Write-Host "  cd path\to\anycode-proxy"
Write-Host "  node index.js"
Write-Host ""
Write-Host "Then run: claude --model deepseek" -ForegroundColor Yellow
Write-Host ""
Write-Host "To switch back to Opus: .\scripts\set-opus-mode.ps1" -ForegroundColor Gray
