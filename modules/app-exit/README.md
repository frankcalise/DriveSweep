# @drivesweep/app-exit

Vendored from [`@legend-apps/app-exit`](https://github.com/LegendApp/legend-apps/tree/main/packages/app-exit)
by Jay Meistrich. Not published to npm (`version: 0.0.0`, `peerDependencies`
using the workspace-only `catalog:` protocol), so it is copied in rather than
installed.

Changes from upstream:

- `peerDependencies` `catalog:` → `*` so it resolves outside their monorepo.
- **Added `setQuitOnLastWindowClosed`.** Upstream handles *intercepting*
  termination, which still requires an `AppDelegate` hook. DriveSweep's `macos/`
  folder is generated and gitignored, so an AppDelegate edit would be erased by
  the next `prebuild`. Observing `NSWindowWillCloseNotification` inside the
  module survives, because the module is a dependency rather than a generated
  file.
