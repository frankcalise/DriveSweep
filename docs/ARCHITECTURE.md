# DriveSweep — Architecture

App design decisions. For what's on disk see [DISCOVERY.md](./DISCOVERY.md); for what
the platform permits see [PLATFORM.md](./PLATFORM.md).

**Nothing here is built yet** beyond `src/catalog.ts`, `src/treemap.ts`,
`src/actions.ts` and `src/ui/`. This is the agreed shape, written down before
implementing.

---

## 1. The native boundary

Three Nitro hybrid objects, split by failure mode rather than by convenience. When
something goes wrong the UI has to say *which* thing went wrong, and these three fail
in completely different ways.

```
                    ┌─────────────────────────────────────┐
                    │  JS: catalog, treemap, plan, UI     │
                    └──┬───────────┬───────────┬──────────┘
                       │           │           │
              ┌────────▼──┐  ┌─────▼──────┐  ┌─▼──────────┐
              │  Scanner  │  │ ToolProbe  │  │  Snapshot  │
              │  (Swift/  │  │  (Swift    │  │  (expo-    │
              │   C++)    │  │   Process) │  │   file-    │
              └───────────┘  └────────────┘  │   system)  │
                                             └────────────┘
```

### `Scanner` — filesystem sizing

`fts_open` walking, `st_blocks * 512`, inode de-duplication. Full contract and the
seven non-negotiables in [PLATFORM.md §3](./PLATFORM.md).

Fails as: a withheld directory (**silently, as an empty listing** — the reason
`checkPaths` reports entry counts rather than just whether `opendir` succeeded),
path vanished mid-walk, permission denied on a subtree.

Note `~` is expanded from the password database, not `NSHomeDirectory()`, which
returns the sandbox container when sandboxed and would otherwise make every
`~` path silently resolve inside it.

### `ToolProbe` — the things that aren't files

`simctl`, `docker`, `brew`, `sdkmanager`, `pnpm store`. Wraps Swift `Process`,
prefers `-j` / `--format json`. This is the only way to see the 56 GB of Cryptex
simulator runtimes at all ([DISCOVERY.md §3.3](./DISCOVERY.md)).

Fails as: tool not installed, `xcode-select` pointing nowhere, non-zero exit, output
shape changed between tool versions. **Read-only.** It enumerates; it does not
execute reclaim commands (§3).

### `Snapshot` — persistence

Plain JSON via `expo-file-system`, which is fine here: the file is small, lives in the
app's own directory, and neither sparseness nor hardlinks apply. No native code
needed, so none is written.

---

## 2. The snapshot cache

A full catalog scan takes **~2 minutes**, and individual entries take up to 76 s
([DISCOVERY.md §3.6](./DISCOVERY.md) — time tracks *file count*, not bytes). The app
must open instantly and show something useful, so it reads the last run from disk.

### Shape

```ts
// Sketch.
interface Snapshot {
  version: 1
  scannedAt: string          // ISO 8601
  volume: { totalBytes: number; freeBytes: number }
  entries: Record<string, {  // keyed by CatalogEntry.id
    bytes: number
    fileCount: number
    scannedAt: string        // per-entry: a re-scan updates one, not all
    present: boolean         // false = not installed on this machine
  }>
}
```

Per-entry `scannedAt` is the important part. Re-scanning one entry must not
invalidate the rest, and the UI needs to show staleness per block.

### Rules

1. **Show cached data immediately on launch**, with its age visible. Never block the
   first paint on a scan.
2. **Age is displayed, always.** A treemap of week-old numbers presented as current
   is worse than no treemap. Anything over ~24h reads as stale in the UI.
3. **Re-scan the specific entry before showing its delete dialog.** This is the one
   place stale data is actually dangerous — the whole point of the confirm step is
   telling the user what they are about to lose, and one entry is seconds to measure
   even when the full catalog is minutes.
4. **Never write a partial scan over a good snapshot.** Cancelled or failed entries
   keep their previous value and stay marked stale.
5. **Discard on version mismatch** rather than migrating. It is a cache; re-scanning
   is always correct.

### Explicitly not doing

- **mtime-based invalidation.** A directory's mtime does not change when a
  descendant grows, so it cannot detect that `DerivedData` doubled. It would produce
  confidently wrong numbers, which is worse than an honest stale label.
- **Background/periodic re-scans.** A tool that spins up 10M-inode walks on its own
  is a worse citizen than the caches it cleans. Scans are user-initiated.

---

## 3. Reclaim: print the commands, don't run them

The app does not delete. The confirm dialog ends by **displaying the exact commands
that would have been used**, for the user to inspect, copy, and run themselves.

This is deliberate and worth keeping past the prototype:

- Every command is auditable before anything is destroyed.
- It sidesteps the sharpest hazards in [DISCOVERY.md §3](./DISCOVERY.md) — deleting
  under a *booted* simulator, `Docker.raw` taking every volume with it, Trash not
  actually reclaiming space.
- Where the owning tool must do the work (`brew cleanup`, `simctl runtime delete`,
  `docker system prune`), printing the command *is* the correct answer, not a
  placeholder for one.
- It builds the corpus we need to judge whether automating any of it is safe.

### Consequence for the data model

`CatalogEntry.reclaim` currently distinguishes `delete` / `command` / `manual`, where
`delete` implies the app unlinks the path. Under this design **every tier needs a
displayable command string**, including the direct-deletion ones:

```
rm -rf ~/Library/Developer/Xcode/DerivedData
```

`src/actions.ts` needs updating to match: `deleteTree` and `runReclaimCommand` become
the wrong abstraction, replaced by rendering a command list. `buildPlan` already
produces the descriptions and precondition lists this needs.

### The dialog

Everything the user needs to decide, in one place:

1. What it is, and how big it is **as of a re-scan seconds ago** (§2 rule 3).
2. What brings it back — `regeneratedBy`.
3. What is lost — `youLose`, for Tier C and D.
4. Anything non-obvious — `caveat`.
5. The preconditions, and which ones are unverified (`checkGuards` returns `false`
   by design today).
6. **The commands, copyable.**

Preconditions still matter even though we aren't executing: a command shown for a
booted simulator is a command the user might paste. Warn in the dialog rather than
relying on them to know.
