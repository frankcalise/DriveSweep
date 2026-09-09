# Changelog

Running log for the overnight session on `feat/scan-module`.
Newest first.

## feat/scan-module

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
