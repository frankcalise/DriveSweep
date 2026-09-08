#!/usr/bin/env bash
# Measure the DriveSweep catalog on this machine.
#
#   ./scripts/scan.sh          human-readable table
#   ./scripts/scan.sh --json   machine-readable
#
# Paths come from src/catalog.ts so there is one source of truth.
# Glob entries (~/code/**/node_modules) are skipped — they need the tree-walking
# scanner described in docs/PLATFORM.md, not du.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CATALOG="$ROOT/src/catalog.ts"
JOBS=8
JSON=0
[[ "${1:-}" == "--json" ]] && JSON=1

[[ -f "$CATALOG" ]] || { echo "missing $CATALOG" >&2; exit 1; }

# Full Disk Access probe — TCC returns an EMPTY listing rather than an error,
# so without this check every size below would silently read 0.
if [[ -z "$(ls -A "$HOME/Library/Caches" 2>/dev/null)" ]]; then
  echo "error: cannot read ~/Library/Caches — grant Full Disk Access to your terminal." >&2
  echo "  System Settings > Privacy & Security > Full Disk Access" >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# id + path pairs, skipping globs.
awk -F"'" '
  /^ *id: / { id = $2 }
  /^ *path: / { if (id != "" && $2 !~ /\*/) print id "\t" $2; id = "" }
' "$CATALOG" | sort -u -t$'\t' -k2,2 > "$work/entries.tsv"

measure() {
  local id="$1" path="${2/#\~/$HOME}"
  if [[ ! -e "$path" ]]; then
    printf '%s\t%s\t-1\t0\n' "$id" "$path" >> "$work/out.tsv"
    return
  fi
  local start mb elapsed
  start=$(date +%s)
  # -x stays on one filesystem: avoids double-counting mounted volumes.
  # Cryptex simulator runtimes are invisible here by design (docs/DISCOVERY.md §3).
  mb=$(du -x -s -m "$path" 2>/dev/null | awk '{print $1}')
  elapsed=$(( $(date +%s) - start ))
  printf '%s\t%s\t%s\t%s\n' "$id" "$path" "${mb:-0}" "$elapsed" >> "$work/out.tsv"
}
export -f measure
export work HOME

: > "$work/out.tsv"
while IFS=$'\t' read -r id path; do
  printf '%s\t%s\0' "$id" "$path"
done < "$work/entries.tsv" \
  | xargs -0 -P "$JOBS" -I{} bash -c 'IFS=$'"'"'\t'"'"' read -r i p <<< "$1"; measure "$i" "$p"' _ {}

if (( JSON )); then
  awk -F'\t' 'BEGIN { print "["; sep = "" }
    { gsub(/"/, "\\\"", $2)
      printf "%s  {\"id\":\"%s\",\"path\":\"%s\",\"gib\":%.2f,\"seconds\":%s,\"present\":%s}\n",
        sep, $1, $2, ($3 < 0 ? 0 : $3/1024), $4, ($3 < 0 ? "false" : "true")
      sep = "," }
    END { print "]" }' "$work/out.tsv"
else
  sort -t$'\t' -k3 -rn "$work/out.tsv" | awk -F'\t' '
    $3 >= 0 { total += $3
              printf "%9.2f GiB  %5ss  %-34s %s\n", $3/1024, $4, $1, $2 }
    $3 < 0  { missing = missing sprintf("           --         %-34s %s\n", $1, $2) }
    END { printf "\n%9.2f GiB  measured total (overlapping entries double-count)\n", total/1024
          if (missing != "") printf "\nnot present on this machine:\n%s", missing }'
fi
