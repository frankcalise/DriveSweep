# @drivesweep/command-runner

Vendored unchanged (bar `peerDependencies`) from
[`@legend-apps/command-runner`](https://github.com/LegendApp/legend-apps/tree/main/packages/command-runner)
by Jay Meistrich. Not published to npm, so copied rather than installed.

DriveSweep uses it for the things that are **not** filesystem problems — the
biggest being simulator runtimes, which live on `nobrowse` APFS volumes that
`fts` cannot see at all. `xcrun simctl runtime list -j` reports `sizeBytes`,
`deletable` and `lastUsedAt` per runtime, none of which a walk could produce.

It only ever reads. DriveSweep does not execute reclaim commands; it prints them.
