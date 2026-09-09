# DriveSweep

A disk cleaner for developers, built with Expo SDK 54 on
[expo-desktop](https://github.com/shirakaba/expo-desktop) `1.0.0-beta.5`
(react-native-macos). Desktop only, macOS only to start.

**Status: discovery and preview only.** The app does not delete anything — by design
it shows you the exact commands it would have used, so they can be audited before
anything is destroyed. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §3.

## Why

A working developer Mac hides most of its used space where no GUI disk tool looks.
On the machine surveyed in [docs/DISCOVERY.md](docs/DISCOVERY.md), `~/Library` alone
held **410.69 GiB** — 56% of the volume — almost entirely build caches, simulator
images and package-manager stores. macOS reports that as an opaque "System Data:
448.7 GB" with no way to drill in.

DriveSweep names what is in there, how big it is, and — the part that actually
matters — **what it costs you to get it back.**

## Docs

| | |
|---|---|
| [docs/DISCOVERY.md](docs/DISCOVERY.md) | Measured survey of a real machine: where the space goes, a four-tier safety classification, and 10 gotchas that break naive disk tools |
| [docs/PLATFORM.md](docs/PLATFORM.md) | Why `expo-file-system` can't do this job, why the sandbox has to go, and why the native work is Nitro |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The native boundary, the snapshot cache, and the print-the-commands reclaim model |

## Code

| | |
|---|---|
| `src/catalog.ts` | The hotspot catalog — path, owning tool, safety tier, what regenerates it, what you lose. Single source of truth. |
| `src/treemap.ts` | Squarified treemap layout (Bruls/Huizing/van Wijk) |
| `src/actions.ts` | Reclaim planning. Every deletion function is an explicit placeholder that throws. |
| `src/ui/` | Treemap view and theme |
| `scripts/scan.sh` | Measures the catalog on your machine, driven by `src/catalog.ts` |

## Running

The native folders (`ios/`, `android/`, `macos/`, `windows/`) are generated and not
tracked. After a fresh clone, create them first:

```sh
bun install
bunx expo-desktop@beta prebuild --template expo-desktop-template-bare-minimum@beta
```

Note `prebuild` currently crashes on Node with an ESM/CJS error *and still exits 0* —
see [docs/PLATFORM.md §5](docs/PLATFORM.md) for the one-line upstream fix and the
local workaround.

```sh
./scripts/scan.sh          # measure this machine (~2 min)
./scripts/scan.sh --json   # machine-readable

bun run macos              # the app — starts Metro, builds, launches
```

**Debug builds need Metro running.** A Debug `.app` contains no `main.jsbundle` and
fetches JS from Metro on launch, so opening one from DerivedData or Finder without
Metro gives you a **blank white window** — no error, no red box, just white.

Use `bun run macos`, which starts Metro for you. If you launch a Debug `.app`
directly, run `npx expo start` first.

Release builds embed the bundle (`--mode Release` → 1.9 MB `main.jsbundle` inside the
app) and run standalone with no dev server.

`scan.sh` needs Full Disk Access on your terminal. Without it macOS returns *empty*
directory listings rather than errors, so the script probes for that up front and
refuses to print numbers it knows are wrong.

## Debugging

There is no way to screenshot the app from a terminal without Screen Recording
permission, so the reliable way to inspect a running build is over Metro's
inspector. This found two bugs that eyeballing would not have: a
`react-native-svg` press handler that fired only once, and a `ScrollView`
rendering ~997px wide for a requested 300.

```sh
curl -s http://localhost:8081/json/list        # find the target
```

Then open a WebSocket to `webSocketDebuggerUrl` and send
`Runtime.evaluate`. Useful expressions:

- Walk `__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots(id)` to count rendered
  components, read hook state, or invoke a prop's `onPress` directly — which
  separates "React is wrong" from "touch delivery is wrong".
- `globalThis.__driveSweepScanner` (dev builds only) exposes `scanRoots`,
  `matchDirs` and `hasFullDiskAccess`, so the native scanner can be exercised
  and diffed against `du` without going through the UI.

Two caveats: `require` is not available in the runtime, and `awaitPromise` is
not supported by this inspector — stash results on a global and poll for them.

## What isn't built

- The three Nitro hybrid objects — `Scanner`, `ToolProbe`, `Snapshot`
  ([docs/ARCHITECTURE.md §1](docs/ARCHITECTURE.md)). The UI currently renders the
  measured snapshot hardcoded in `src/catalog.ts`.
- The snapshot cache ([docs/ARCHITECTURE.md §2](docs/ARCHITECTURE.md)).
- The confirm dialog and its command list. `src/actions.ts` still models deletion as
  something the app performs, which [§3](docs/ARCHITECTURE.md) supersedes.
- The app is still sandboxed, which blocks reading every path it cares about
  ([docs/PLATFORM.md §2](docs/PLATFORM.md)).
