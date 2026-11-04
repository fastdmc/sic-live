# Runs the chunks with the Cursor CLI, one headless agent per chunk, from the repo root.
# Usage: .\scripts\run-overnight.ps1 -First 1 -Last 14
# Needs: the Cursor CLI on PATH and signed in (`agent`, or `cursor-agent` on older installs), git, Node 20, pnpm 9.
# If the CLI is not available on Windows, run scripts/run-overnight.sh in WSL instead, or use the Background Agent route.
# A chunk runs only if it is not ticked in docs/PROGRESS.md, not listed in docs/BLOCKERS.md, and every chunk in its "Depends on" line is ticked.
param([int]$First = 1, [int]$Last = 14)
$agent = Get-Command agent -ErrorAction SilentlyContinue
if (-not $agent) { $agent = Get-Command cursor-agent -ErrorAction SilentlyContinue }
if (-not $agent) { Write-Host 'Cursor CLI not found. Install it, sign in, then re-run.'; exit 1 }
New-Item -ItemType Directory -Force -Path logs | Out-Null
git checkout -B overnight/build 2>$null | Out-Null
$env:SIC_DATA_MODE = 'fake'; $env:SIC_AUTH_MODE = 'dev'

function Test-Ticked([string]$nn) { (Test-Path docs/PROGRESS.md) -and (Select-String -Path docs/PROGRESS.md -Pattern "^- \[x\] $nn( |$)" -Quiet) }
function Test-Blocked([int]$n) { (Test-Path docs/BLOCKERS.md) -and (Select-String -Path docs/BLOCKERS.md -Pattern "chunk 0*$n([^0-9]|$)" -Quiet) }
function Test-DepsMet([string]$file) {
  $line = (Select-String -Path $file -Pattern '^\*\*Depends on' | Select-Object -First 1).Line
  if (-not $line) { return $true }
  foreach ($m in [regex]::Matches($line, '\d{2}')) { if (-not (Test-Ticked $m.Value)) { return $false } }
  return $true
}

foreach ($n in $First..$Last) {
  $nn = '{0:D2}' -f $n
  $chunk = Get-ChildItem -Path docs/chunks -Filter "$nn-*.md" | Select-Object -First 1
  if (-not $chunk) { Write-Host "No chunk $nn"; continue }
  if (Test-Ticked $nn) { Write-Host "Chunk $nn already done"; continue }
  if (Test-Blocked $n) { "Chunk $nn is listed in BLOCKERS.md; skipping" | Tee-Object -FilePath logs/overnight.log -Append; continue }
  if (-not (Test-DepsMet $chunk.FullName)) { "Chunk $nn skipped: a chunk it depends on is not done" | Tee-Object -FilePath logs/overnight.log -Append; continue }
  "$((Get-Date).ToUniversalTime().ToString('s'))Z starting $($chunk.Name)" | Tee-Object -FilePath logs/overnight.log -Append
  $prompt = "Read AGENTS.md and the docs it lists. Do docs/chunks/$($chunk.Name) completely and only that chunk. Run its acceptance checks and pnpm check until they pass. Tick it in docs/PROGRESS.md. If still failing after three attempts, write docs/BLOCKERS.md (start the entry with 'Chunk $nn') and stop. Commit with message 'chunk ${nn}: <title>'. Never connect to Azure, the database, Graph or Teams."
  & $agent.Source -p --force --output-format text $prompt *> "logs/chunk-$nn.log"
  git add -A; git commit -q -m "chunk ${nn}: runner checkpoint" 2>$null
  "$((Get-Date).ToUniversalTime().ToString('s'))Z finished chunk $nn" | Tee-Object -FilePath logs/overnight.log -Append
}
Write-Host 'Done. Read docs/PROGRESS.md and docs/BLOCKERS.md.'
