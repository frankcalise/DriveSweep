# Changelog

Running log for the overnight session on `feat/scan-module`.
Newest first.

## feat/scan-module

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
