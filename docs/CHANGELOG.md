# Changelog

Running log for the overnight session on `feat/scan-module`.
Newest first.

## feat/scan-module

- **Drop the 2s access poll to a single startup probe**
  - The poll existed so granting Full Disk Access mid-session would start a
    scan without a relaunch. Since FDA isn't needed, the thing that actually
    blocks reads is the App Sandbox — fixed at launch, unable to change while
    the app runs — so it was re-reading three directories every 2s forever for
    no benefit. `recheck()` covers the rare mid-session case.
  - `noUnusedLocals` immediately caught the now-dead `useEffect` import.
  - Verified with fresh fiber walks per sample: forcing access false leaves it
    false for 8s with the gate up (the poll would have flipped it back), and
    pressing Check again flips it true, swaps gate→treemap, and leaves
    `status: 'done'` with all 32 measurements intact.
  - Note: earlier verification of this behaviour used a captured hook object,
    which goes stale after a state update and reported pre-update values. Those
    reads were unreliable; re-done by re-walking the tree on every sample.

- **Act on code review: fix the access probe, the gate button, and cancel**
  - **`~` now expands from the password database, not `NSHomeDirectory()`.**
    Under the App Sandbox the latter returns the app's container, so every `~`
    path in the scanner would have silently resolved *inside* it — measuring
    the container's own `Library/Caches` and reporting it as the user's. This
    also made the access probe pass while the real directories were
    unreachable, defeating the gate in exactly the case it was rewritten for.
  - Probe list now includes an absolute path outside any container
    (`/Library/Developer`), and unverifiable access is treated as **no** access
    rather than yes.
  - **"Check again" no longer starts a scan.** It called `scan.start`, which
    ran a multi-minute walk behind the still-visible gate, recorded zeros for
    every entry and left `status: 'done'` — which then blocked the auto-start
    that would have measured properly once access appeared. Added `recheck()`,
    which only re-probes. Verified: pressing it leaves `status: 'done'` and all
    32 measurements intact.
  - Cancel now stops the post-walk phases, and `matchDirs` no longer clears the
    cancel flag it was handed — previously Cancel stopped the walk, then the
    app immediately began three `~/code` traversals and a simctl call.
  - Progress `+1` for the simctl phase is consumed unconditionally, so it can't
    stall at 31/32 on a Mac without Xcode. Verified 32/32.
  - Removed stale Full Disk Access claims from the README dev-handle list
    (renamed export), `ARCHITECTURE.md`, `apply-native-patches.sh` and
    `scan.sh`'s error message. Untracked a committed
    `expo-desktop-spawn-debug*.log` and added the ignore rule the beta scaffold
    dropped.

- **Rewrite AccessGate for the real failure mode; enable `noUnusedLocals`**
  - Kept the gate, but its cause changed rather than going away: `macos/` is
    gitignored, so every `prebuild` restores the App Sandbox until
    `apply-native-patches.sh` re-runs, and a sandboxed build reads nothing.
    The reason it must be a hard gate is unchanged — macOS reports withheld
    directories as *empty*, so the alternative is a treemap of zeros.
  - Reordered the actions: "Check again" is primary, Full Disk Access is a
    labelled fallback rather than the headline instruction.
  - Deleted an orphaned `Step` component and its styles, left behind by my own
    earlier edit to this file.
  - Turned on `noUnusedLocals` — plain `strict` did not catch that dead code.
    Zero errors across the repo, so it costs nothing and stops a recurrence.

- **Fix the access check; Full Disk Access turns out to be unnecessary**
  - The old `hasFullDiskAccess()` probed `~/Library/Application Support/
    com.apple.TCC/TCC.db`, which is SIP-protected *beyond* FDA on current
    macOS. Verified: a terminal holding FDA still gets `Operation not
    permitted`. So the probe always returned false and the gate could never
    open, no matter what the user granted.
  - Replaced with `checkPaths`, which `opendir`s the actual catalog roots and
    counts entries — a denied directory opens but reads back empty, so
    "opened" alone proves nothing.
  - **Measured: an unsandboxed build with no FDA grant reads every path in the
    catalog** (DerivedData, `~/Library/Caches`, CoreSimulator devices, other
    apps' containers, `/Library/Developer`). Only `~/Library/Safari` was
    refused, and we don't scan it. Leaving the sandbox is necessary *and
    sufficient*; corrected in DISCOVERY.md gotcha 7, PLATFORM.md section 2,
    the README and the gate's own copy.
  - **First full live scan: 32 entries in 171s.** `sim-devices` 98.88 GiB with
    **179,430 hardlinked inodes de-duplicated** — simulator app bundles link
    heavily, so this would badly over-report without it. `bun-cache` 16.69 GiB
    across 1.32M files in 50s.
  - Progress denominator now counts walk roots + glob matches + the simctl
    probe, instead of reading "32/28".

- **Measure simulator runtimes via simctl (the Cryptex blind spot)**
  - Vendored `@legend-apps/command-runner` as `modules/command-runner` (an
    `NSTask` runner with availability checks) and added `src/toolProbe.ts` on
    top of it. Read-only.
  - `xcrun simctl runtime list -j` reports `sizeBytes`, `deletable` and
    `lastUsedAt` per runtime — none of which a filesystem walk can produce.
  - **Validated:** app reported 60,289,076,260 bytes; summing simctl's JSON
    directly gives the identical figure, 0 bytes delta, matching simctl's own
    "Total Disk Images: 7 (56.1G)". `du -x` on the same path reports
    **0.00 GiB**, which is precisely the blind spot DISCOVERY.md describes.
  - Needs no Full Disk Access, so this is real measured data on this machine
    today rather than snapshot.
  - Useful side effect: `lastUsedAt` shows 4 of 7 runtimes never used or idle
    2+ weeks — **32.53 GiB** of the 56.15.

- **Rescan control, progress bar, and documentation of tonight's traps**
  - Rescan / Cancel button in the header, plus a thin progress bar while a scan
    runs. The access check also polls every 2s, so granting Full Disk Access
    while the app is open starts a scan without a relaunch.
  - `docs/PLATFORM.md` gained four traps that each cost real time: Turbo Module
    codegen going stale silently (new method's promise simply never resolves);
    bun copying `file:` deps; ObjC property setters colliding with Turbo Module
    method selectors; and `requires` being a C++20 keyword.
  - `README.md` gained a Debugging section covering the Metro-inspector
    workflow, since the app cannot be screenshotted from a terminal.

- **Measure glob catalog entries, and correct three figures**
  - Added `matchDirs` to the scanner: totals every directory under a root whose
    basename matches, with an optional path constraint and exclusions. Covers
    the catalog entries written as globs, which a walk root cannot express.
  - Single-pass by design. A nested `fts_open` inside an active walk wedged the
    process, so a match is tracked by depth on one cursor instead.
  - Catalog entries now carry a `match` spec, so this is data, not special cases.
  - **Validated to the byte against `du`:**
    `node_modules` 33,403,928 KiB / 259 dirs; `ios/Pods` 7,428,484 KiB / 10;
    android `build` 6,652,244 KiB / 31. All 0.00% delta. 237 hardlinked inodes
    de-duplicated in the node_modules pass — the pnpm store.
  - Corrected `node_modules` 32.03 → 31.86 GiB, `ios/Pods` 5.94 → 7.08 GiB, and
    android `build` 7.04 → 6.34 GiB. The last was wrong in DISCOVERY.md because
    `find -path "*/android/*build"` also matches names *ending* in "build" and
    was counting `*_autolinked_build` CMake dirs under `.cxx/`. Documented.
  - `scripts/sync-modules.sh` (`bun run modules:sync`) copies `modules/` into
    `node_modules`, because bun installs `file:` deps by copying.
  - Note: adding a Turbo Module method requires deleting `macos/build/generated`
    and re-running `pod install`, or codegen silently keeps the old spec and the
    new method's promise never resolves.

- **Wire the scanner into the app; validated against `du`**
  - `src/useScan.ts` runs the catalog through the native scanner and merges
    live results by root index. Sizes shown are live where measured and fall
    back to the recorded snapshot otherwise — the panel says which, never
    silently substituting one for the other.
  - `src/ui/AccessGate.tsx` blocks the UI when Full Disk Access is missing,
    explains that macOS returns protected directories as *empty* rather than
    erroring, and links to the right Settings pane.
  - Closing the window now quits the app.
  - **Validated:** scanner output matches `du -sk` exactly on four paths,
    including 4,326,560 KiB for `~/.npm/_npx`. Directory counts match exactly;
    the file count is higher by 897 because symlinks occupy blocks and are
    counted, while `find -type f` skips them.
  - Fixed a self-inflicted crash: `@property BOOL quitOnLastWindowClosed`
    synthesizes `setQuitOnLastWindowClosed:` — the same selector codegen emits
    for the Turbo Module method — so the setter called itself until the stack
    guard page was hit (`EXC_BAD_ACCESS`/SIGBUS at launch). Now a plain ivar.
  - Local modules stay on `file:` deps. `link:` means a globally-linked package
    in bun, and adding `workspaces` stopped bun installing
    `expo-desktop-metro-config`'s own dependencies, which broke Metro. Caveat:
    `file:` **copies**, so JS edits under `modules/` need `bun install` to take
    effect. Native edits are read from `modules/` directly by CocoaPods.

- **Vendor native modules and build a real disk scanner**
  - Added `modules/disk-scanner` (`@drivesweep/disk-scanner`), a Turbo Module
    that walks paths with `fts_open` and reports actual disk usage.
    Modelled on the packaging of `@legend-apps/file-scanner` but with the
    internals replaced: `st_blocks * 512` instead of `NSFileSize`,
    `(st_dev, st_ino)` de-duplication for hardlinks, `FTS_PHYSICAL` so symlink
    farms are not followed, `FTS_XDEV` so mounts aren't folded in, and
    aggregate-per-root results instead of a per-file JSON list.
  - Added `hasFullDiskAccess()` — probes `TCC.db`. TCC denial is silent
    (protected dirs read back empty), so this has to gate the UI.
  - Vendored `@legend-apps/app-exit` as `modules/app-exit`, extended with
    `setQuitOnLastWindowClosed` so closing the window quits instead of leaving
    the app in the Dock. Lives in the module because `macos/` is gitignored and
    an AppDelegate edit would not survive `prebuild`.
  - Both wired as `file:` dependencies — no monorepo restructure needed.
    Neither upstream package is published (`0.0.0`, `catalog:` peer deps).
  - Disabled the App Sandbox via `scripts/apply-native-patches.sh`, re-runnable
    after every prebuild.
