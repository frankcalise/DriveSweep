#!/usr/bin/env bash
# Copy modules/* into node_modules/@drivesweep/* .
#
# bun installs `file:` dependencies by COPYING, so JS edits under modules/ are
# invisible to Metro until they are re-copied. (bun's `link:` means a globally
# linked package, and `workspaces` stopped bun installing
# expo-desktop-metro-config's own dependencies — see docs/PLATFORM.md.)
#
# Native code is unaffected: CocoaPods reads podspecs from modules/ directly.
#
#   ./scripts/sync-modules.sh      # or: bun run modules:sync

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for dir in "$ROOT"/modules/*/; do
  name="$(basename "$dir")"
  dest="$ROOT/node_modules/@drivesweep/$name"
  if [[ -d "$dest" ]]; then
    rsync -a --delete "$dir" "$dest/"
    echo "  synced $name"
  else
    echo "  skipped $name (not installed — run bun install)" >&2
  fi
done
