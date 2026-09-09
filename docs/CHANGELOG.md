# Changelog

Running log for the overnight session on `feat/scan-module`.
Newest first.

## feat/scan-module

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
