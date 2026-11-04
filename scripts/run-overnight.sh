#!/usr/bin/env bash
# Runs the chunks with the Cursor CLI, one headless agent per chunk, from the repo root.
# Usage: scripts/run-overnight.sh [first] [last]      e.g. scripts/run-overnight.sh 1 14
# Needs: the Cursor CLI installed and signed in (`agent`; older installs call it `cursor-agent`), git, Node 20, pnpm 9.
# A chunk runs only if it is not ticked in docs/PROGRESS.md, not listed in docs/BLOCKERS.md, and every chunk in its "Depends on" line is ticked.
set -u
FIRST="${1:-1}"; LAST="${2:-14}"
AGENT="$(command -v agent || command -v cursor-agent || true)"
if [ -z "$AGENT" ]; then echo "Cursor CLI not found. Install it, sign in, then re-run."; exit 1; fi
mkdir -p logs
git checkout -B overnight/build >/dev/null 2>&1 || true
export SIC_DATA_MODE=fake SIC_AUTH_MODE=dev

ticked()   { grep -Eq "^- \[x\] $1( |$)" docs/PROGRESS.md 2>/dev/null; }
blocked()  { grep -Eiq "chunk 0*$((10#$1))([^0-9]|$)|^#+ *0*$((10#$1))([^0-9]|$)" docs/BLOCKERS.md 2>/dev/null; }
deps_met() {
  local file="$1" d
  for d in $(grep -m1 -i '^\*\*Depends on' "$file" | grep -oE '[0-9]{2}'); do
    ticked "$d" || return 1
  done
  return 0
}

for n in $(seq "$FIRST" "$LAST"); do
  nn=$(printf "%02d" "$n")
  chunk=$(ls docs/chunks/${nn}-*.md 2>/dev/null | head -n 1)
  [ -z "$chunk" ] && { echo "No chunk $nn"; continue; }
  if ticked "$nn"; then echo "Chunk $nn already done"; continue; fi
  if blocked "$nn"; then echo "Chunk $nn is listed in BLOCKERS.md; skipping" | tee -a logs/overnight.log; continue; fi
  if ! deps_met "$chunk"; then echo "Chunk $nn skipped: a chunk it depends on is not done" | tee -a logs/overnight.log; continue; fi
  echo "$(date -u +%FT%TZ) starting $chunk" | tee -a logs/overnight.log
  prompt="Read AGENTS.md and the docs it lists. Do $chunk completely and only that chunk. Run its acceptance checks and pnpm check until they pass. Tick it in docs/PROGRESS.md. If still failing after three attempts, write docs/BLOCKERS.md (start the entry with 'Chunk ${nn}') and stop. Commit with message 'chunk ${nn}: <title>'. Never connect to Azure, the database, Graph or Teams."
  "$AGENT" -p --force --output-format text "$prompt" > "logs/chunk-${nn}.log" 2>&1
  status=$?
  git add -A && git commit -q -m "chunk ${nn}: runner checkpoint" || true
  echo "$(date -u +%FT%TZ) finished chunk $nn with status $status" | tee -a logs/overnight.log
done
echo "Done. Read docs/PROGRESS.md and docs/BLOCKERS.md."
