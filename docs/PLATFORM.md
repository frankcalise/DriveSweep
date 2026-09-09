# DriveSweep — Platform Constraints (Expo SDK 54 / expo-desktop / macOS)

Findings verified against the installed source in this repo, not from memory.
Expo docs referenced: <https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/>

**Scope: desktop only, macOS only to start.** No iOS, Android, Windows or Mac App
Store target. That settles several questions below that would otherwise be
trade-offs — see §2 and §5.

**Scaffold: `expo-desktop@1.0.0-beta.5`** (`create-app` +
`prebuild --template expo-desktop-template-bare-minimum@beta`), on
react-native 0.81.6 / react-native-macos 0.81.7 / expo ~54.0.35. Note
react-native-macos went *down* from 0.81.9 on the stable scaffold. §5 records
what the beta fixed and what it still carries.

---

## 1. `expo-file-system` on macOS: builds, but cannot do this job

### It does build for macOS (the docs are misleading)

The SDK 54 docs list platform support as **Android, iOS, tvOS** — macOS is absent.
That is wrong at the packaging level. Verified:

- `node_modules/expo-file-system/expo-module.config.json` → `"platforms": ["apple", "android"]`
  — `apple` covers macOS, not just iOS.
- `node_modules/expo-file-system/ios/ExpoFileSystem.podspec` → `s.platforms = { :ios => '15.1', :osx => '11.0', :tvos => '15.1' }`
- **`macos/Podfile.lock` already contains `ExpoFileSystem (19.0.24)`** — it is linked
  into this app's macOS target today, via `use_expo_modules!` in `macos/Podfile`.

So `import { File, Directory, Paths } from 'expo-file-system'` will resolve and run.

### But three properties make it unusable for disk scanning

#### a. `Directory.size` reports **apparent** size, not disk usage

`ios/FileSystemDirectory.swift:34`:

```swift
var size: Int64 {
  get throws {
    try validatePermission(.read)
    var size: Int64 = 0
    guard let subpaths = try? FileManager.default.subpathsOfDirectory(atPath: url.path) else { ... }
    for subpath in subpaths {
      let strSubpath = url.appendingPathComponent(subpath).path
      guard let attributes = try? FileManager.default.attributesOfItem(atPath: strSubpath),
            let subpathSize = attributes[.size] as? Int64 else { continue }
      size += subpathSize
    }
    return size
  }
}
```

`FileAttributeKey.size` is `st_size`. On the sparse `Docker.raw` measured in
[DISCOVERY.md](./DISCOVERY.md) that is **60 GB instead of 8.1 GB** — a 7.4x error.
`File.size` (`ios/FileSystemFile.swift:63`) has the same problem.
Correct disk usage needs `st_blocks * 512`.

#### b. It is an eager, synchronous, whole-tree walk

`subpathsOfDirectory` materialises **every descendant path into one array** before any
size is computed. Pointing it at `~/Library` (a subset of 9.8M inodes) allocates
millions of `String`s and blocks until done. There is no streaming, no progress, no
cancellation. The `size` getter is `get throws` — synchronous.

#### c. It counts hardlinked inodes repeatedly

No `(st_dev, st_ino)` de-duplication, so the pnpm store — one copy hardlinked into
every `node_modules` — is counted once per link. Over-reports badly on exactly the
trees DriveSweep cares about.

### And directory picking is disabled on macOS

`ios/FileSystemModule.swift:114` and `:128`:

```swift
AsyncFunction("pickDirectoryAsync") { (initialUri: URL?, promise: Promise) in
  #if os(iOS)
  filePickingHandler.presentDocumentPicker(...)
  #else
  promise.reject(FeatureNotAvailableOnPlatformException())
  #endif
}
```

`pickDirectoryAsync` and `pickFileAsync` **reject on macOS**. This matters more than it
looks — see §2: it removes the only sandbox-legal way to obtain a user-granted folder.

`Paths.availableDiskSpace` / `Paths.totalDiskSpace` are still fine and worth using for
the volume gauge.

### Conclusion

`expo-file-system` is usable for reading and writing DriveSweep's own cache/config
files — including the scan snapshot ([ARCHITECTURE.md](./ARCHITECTURE.md) §2), which
is small and lives in the app's own directory where `st_size` is accurate and
hardlinks are irrelevant.

**Scanning needs a native module.** Not a preference — three independent correctness
bugs for this use case, plus no picker. That module is Nitro; see §3.

---

## 2. The App Sandbox blocks this app as currently configured

`macos/DriveSweep-macOS/DriveSweep.entitlements` today:

```xml
<key>com.apple.security.app-sandbox</key>        <true/>
<key>com.apple.security.files.user-selected.read-only</key> <true/>
<key>com.apple.security.network.client</key>     <true/>
```

A sandboxed app can read only its own container plus paths the user explicitly grants.
It cannot enumerate `~/Library`, `/Library/Developer`, or `/opt/homebrew` — which is
where 100% of the interesting space lives. Worse, **the grant mechanism is unavailable**:
`pickDirectoryAsync` rejects on macOS (§1), so without writing native `NSOpenPanel` code
there is no way to obtain a security-scoped URL at all.

Because there is no Mac App Store target, this is settled rather than a trade-off:
**disable the sandbox and require Full Disk Access.** Option B is recorded only so
the reasoning isn't relitigated later.

### Decision — Disable the sandbox, require Full Disk Access

```xml
<key>com.apple.security.app-sandbox</key> <false/>
```

Then the user grants **Full Disk Access** in
System Settings → Privacy & Security → Full Disk Access.

- Reads everything DriveSweep needs.
- Cannot ship on the Mac App Store (sandbox is mandatory there). Out of scope by
  decision; direct distribution and notarisation still work.
- **FDA cannot be requested programmatically.** No API prompts for it. The app must
  detect denial and walk the user to the settings pane
  (`x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles`).
- **Denial is silent.** TCC returns an *empty* directory listing rather than an error.
  A scan without FDA reports `0 GiB` and looks like a clean disk.
  Mitigation — probe a known-nonempty path at startup:

  ```swift
  // ~/Library/Caches always has contents on a real machine.
  let probe = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Caches")
  let entries = try? FileManager.default.contentsOfDirectory(atPath: probe.path)
  let hasFullDiskAccess = (entries?.isEmpty == false)
  ```

  Gate the entire UI on this and show a first-run explainer if false.

### Rejected — Keep the sandbox, add native `NSOpenPanel` + security-scoped bookmarks

Requires `com.apple.security.files.user-selected.read-write` and persisting bookmarks
across launches. But the user must hand-pick each root, `~/Library` is hidden in the
open panel by default, and some paths stay refused. Degrades the product to
"point it at a folder", and buys nothing without an App Store target.

Every comparable tool (DaisyDisk, GrandPerspective, OmniDiskSweeper) ships
unsandboxed with FDA for exactly these reasons.

Deletion needs no extra entitlement beyond FDA once unsandboxed — but DriveSweep
does not delete at all in its current design. It prints the commands instead; see
[ARCHITECTURE.md](./ARCHITECTURE.md) §3.

---

## 3. The native scanner

### API choice

| Approach | Verdict |
|---|---|
| `FileManager.subpathsOfDirectory` | No. Eager, allocates whole tree, `st_size` only. |
| `FileManager.enumerator(at:)` | Workable, lazy, but ~1 `NSURL` + attribute fetch per entry. |
| `fts_open(3)` | Good. C API, streams, gives `struct stat` (so `st_blocks`) for free. |
| `getattrlistbulk(2)` | Fastest. Batches many entries per syscall. What `fd`/`ripgrep` use. |

Start with **`fts_open`** — it hands back a populated `struct stat` per entry, which is
precisely what is needed, and is far simpler than `getattrlistbulk`. Move to
`getattrlistbulk` only if measurement justifies it.

Non-negotiables for the scanner:

1. **Size from `st_blocks * 512`**, never `st_size`.
2. **De-duplicate on `(st_dev, st_ino)`** — a `Set` per scan run.
3. **Set `FTS_XDEV`** (don't cross device boundaries) so mounted volumes aren't
   double-counted — but then handle Cryptex explicitly (see §4).
4. **`FTS_PHYSICAL`** — do not follow symlinks; symlink farms in `.bin` directories
   would otherwise cause loops and double counting.
5. **Stream partial results** to JS as each catalog entry completes, so the UI fills in
   progressively. Do not await a whole-disk total.
6. **Support cancellation** — check a flag between `fts_read` calls.
7. **Run off the main thread**, dispatch results back.

### Bridging shape — Nitro Modules

Nitro (`react-native-nitro-modules`) rather than a local Expo module. Verified
against 0.37.1:

- `NitroModules.podspec` declares `:macos => 10.13` **and** `:osx => 10.13`.
- `ModuleNotFoundError.ts` switches `case 'ios': case 'macos':` together — macOS is a
  first-class Apple target, not incidental.
- `peerDependencies: { "react-native": "*" }`, so react-native-macos satisfies it.
- Requires the New Architecture and RN >= 0.75. Both already true here: this app
  builds with `-DRCT_NEW_ARCH_ENABLED=1` on RN 0.81.

Why it fits better than an Expo module for this specific job:

| | |
|---|---|
| Direct JSI, no bridge serialisation | Scan results are large; per-call marshalling is the thing to avoid |
| `ArrayBuffer` support | A packed binary result buffer beats thousands of JS objects |
| Typed codegen from a TS interface | The catalog is already typed; the native side stays in sync by construction |
| C++ core with an optional Swift layer | `fts`/`getattrlistbulk` are C APIs; `simctl` wrapping wants Swift `Process` |

**Non-obvious detail:** `PlatformSpec` in `HybridObject.ts` has only `ios` and
`android` keys — there is no `macos` key. Declare `{ ios: 'swift' }` and the Apple
implementation covers macOS, because the podspec compiles `ios/**` for the `:osx`
platform too. Worth confirming with a trivial module before building the real
scanner on that assumption.

Interface sketch, matching Nitro's actual API (`getHybridObjectConstructor`,
`HybridObject`):

```ts
// Sketch — not yet implemented. See ARCHITECTURE.md §1 for the full boundary.
import { type HybridObject, getHybridObjectConstructor } from 'react-native-nitro-modules'

export interface Scanner extends HybridObject<{ ios: 'swift' }> {
  /** Resolves when the whole root is done; onEntry fires as results arrive. */
  scan(
    roots: string[],
    onEntry: (path: string, bytes: number, files: number, dedupedInodes: number) => void,
  ): Promise<void>
  cancel(): void
  /** Probe for the silent-TCC-denial case in §2. */
  readonly hasFullDiskAccess: boolean
}

export const HybridScanner = getHybridObjectConstructor<Scanner>('Scanner')
```

Non-negotiables for the scanner implementation:

1. **Size from `st_blocks * 512`**, never `st_size`.
2. **De-duplicate on `(st_dev, st_ino)`** — a `Set` per scan run.
3. **Set `FTS_XDEV`** (don't cross device boundaries) so mounted volumes aren't
   double-counted — but then handle Cryptex explicitly (see §4).
4. **`FTS_PHYSICAL`** — do not follow symlinks; symlink farms in `.bin` directories
   would otherwise cause loops and double counting.
5. **Stream partial results** per catalog entry, not per file. Nitro callbacks are
   cheap but not free, and the UI only needs entry-level granularity.
6. **Support cancellation** — check a flag between `fts_read` calls.
7. **Run off the main thread**, dispatch results back.

## 4. Things that are not filesystem problems

Some of the biggest reclaimable items cannot be measured or deleted by path
(detail in [DISCOVERY.md](./DISCOVERY.md) §3). These need process invocation, which
means an unsandboxed app plus `Process`:

| Item | Enumerate with | Reclaim with |
|---|---|---|
| Simulator runtimes (56.1 GB, Cryptex volumes) | `xcrun simctl runtime list -j` | `xcrun simctl runtime delete <id>` |
| Simulator devices / app data | `xcrun simctl list devices -j` | `simctl erase <udid>`, `simctl delete unavailable` |
| Docker images & volumes | `docker system df` | `docker system prune` |
| Homebrew | `brew cleanup -n` | `brew cleanup` |
| Android SDK components | `sdkmanager --list_installed` | `sdkmanager --uninstall` |
| asdf toolchains | `asdf list` | `asdf uninstall` |

All of these have JSON or parseable output. Prefer `-j`/`--format json` where offered.
Note `xcrun` requires the Xcode command-line tools to be selected; check
`xcode-select -p` before assuming.

These get their own Nitro hybrid object wrapping Swift `Process` — separate from the
filesystem scanner, because the failure modes are completely different (tool missing,
tool errored, output shape changed vs. permission denied, path vanished). Enumeration
is safe to run; **execution is not wired up** ([ARCHITECTURE.md](./ARCHITECTURE.md) §3).

---

## 5. Dependency gotchas on expo-desktop

Hit while wiring up the treemap. All verified on this machine.

### `npx expo install` pins versions that don't build on macOS

`expo install react-native-svg` selects the **SDK 54-compatible** version, 15.12.1.
That version does not compile for macOS under the New Architecture:

```
RNSVGImage.mm:134:26: error: expected a type
  - (void)didReceiveImage:(UIImage *)image metadata:(id)metadata ...
RNSVGImage.mm:143:29: error: property 'size' not found on object of type 'id'
```

`UIImage` is UIKit; macOS needs `NSImage`. The Fabric code path had no macOS guard.
Fixed upstream by **15.15.5**, which wraps it:

```objc
#if !TARGET_OS_OSX // [macOS]
- (void)didReceiveImage:(UIImage *)image ...
#else // [macOS
- (void)didReceiveImage:(NSImage *)image ...
#endif // macOS]
```

So this project pins `react-native-svg@15.15.5` directly rather than taking Expo's
pin. Expect the same pattern for other native deps: **Expo's compatibility matrix is
computed for iOS/Android, and says nothing about macOS.** When a native module fails
to build here, check for `TARGET_OS_OSX` guards in the newest release before
concluding it is unsupported.

### `react-native-svg`'s `onPress` fires only once on macOS

`onPress` on an `<G>` (and presumably any SVG node) delivers the **first** press and
then goes dead — you can select one treemap cell and never a second.

Diagnosed by walking the React fiber tree over CDP and invoking the collected
handlers directly:

```
handlers=32 | before=npm-cacache | invoked=sim-devices | after=npm-cacache
(next read) hook1="sim-devices"
```

All 32 handlers were wired, and calling one updated state correctly. So React and
the handlers are fine and the **touch delivery** is what breaks. Almost certainly
react-native-macos's responder handling in `RNSVGSvgView` not releasing after the
first grant.

**Fix: don't use SVG press handling.** Keep the SVG paint-only and overlay one
absolutely-positioned `Pressable` per shape, using core RN's responder system:

```tsx
<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
  {cells.map(({ datum, x, y, w, h }) => (
    <Pressable key={datum.id} onPress={() => onSelect(datum.id)}
      style={{ position: 'absolute', left: x, top: y, width: w, height: h }} />
  ))}
</View>
```

Better anyway: it gets real accessibility roles/labels, and `onHoverIn`/`onHoverOut`
for free when we want hover — which SVG nodes don't provide on macOS either.

### `expo-desktop@1.0.0-beta.5 prebuild` crashes on Node (ESM/CJS)

`prebuild` fails immediately and generates nothing:

```
build/prebuild/expo/clear-native-folder.js:1
import { AndroidConfig, IOSConfig } from "@expo/config-plugins";
SyntaxError: Named export 'AndroidConfig' not found. The requested module
'@expo/config-plugins' is a CommonJS module...
```

**The CLI still exits 0**, so this is silent in any script or CI that checks status.

Root cause: `@expo/config-plugins` is CommonJS. Node's `cjs-module-lexer` statically
detects 36 of its named exports — but **not** `AndroidConfig`, `IOSConfig` or
`WarningAggregator` (lazy getter re-exports). `XcodeProject` *is* detected, which is
why only some named imports fail. All three are present on the default export, so the
fix is the one Node suggests:

```js
import pkg from '@expo/config-plugins'
const { AndroidConfig, IOSConfig } = pkg
```

Not Node-version-specific — the lexer cannot see those exports on any version.

Workarounds, for the record:
- Patch that one import (what we did). Everything downstream then succeeds:
  native folders generated, CocoaPods installed for both ios and macos.
- Running the CLI under `bun` gets past the import but **corrupts the generated
  pbxproj**: content ends correctly, then the file is NUL-padded to ~1.7x its size
  (21448 bytes of project followed by 15872 NULs), which crashes `xcode`'s peg
  parser. That is a bun `write` bug, not an expo-desktop one — do not report it as
  such.

### `react-native-windows` breaks CLI commands on macOS

**Given the macOS-only scope, the cleanest fix is to drop `react-native-windows`
(and probably the `ios/`, `android/` and `windows/` directories) from the project
entirely.** Not done yet — it should be a deliberate, separate change, and it is
worth checking first whether the expo-desktop scaffold's autolinking assumes RNW is
present. Until then:

Still present on `beta.5` — three such lines per Metro start, since the beta still
installs react-native-windows. (Unrelated but fixed by the beta: `metro.config.js`
now uses `expo-desktop-metro-config`'s `makeMetroConfig(__dirname)` in place of the
`@rnx-kit` + `@expo/metro-config` pairing, which removes the spurious
`Unknown option "watcher.unstable_workerThreads"` validation warning.)

Having react-native-windows installed (expo-desktop installs it for the Windows
target) makes every CLI invocation print:

```
/bin/sh: dotnet.exe: command not found
Error: Unable to find pwsh.exe. It should have been made available by `yarn install`.
```

`react-native-windows/react-native.config.js` requires `@react-native-windows/cli`
at module load, which probes for Windows tooling and throws. `rnc-cli config` still
reports `platforms: ['ios', 'android', 'macos']`, and Metro still serves
`?platform=macos`, so this is mostly noise — but it is alarming noise that looks
like the cause of unrelated failures.

### Release builds: fixed by the beta scaffold

**Was** broken on the stable `expo-desktop` scaffold: the *Bundle React Native code
and images* phase failed with

```
error: Invalid platform "macos" selected.
Available platforms are: "ios", "android".
```

because `react-native-xcode.sh` defaulted `CLI_PATH` to
`$REACT_NATIVE_DIR/scripts/bundle.js` — **core** react-native's bundler, which has no
out-of-tree platform registration. Debug builds were unaffected (JS comes from Metro),
so only Release was blocked.

The `1.0.0-beta.5` scaffold routes bundling through Expo CLI instead:

```sh
if [[ -z "$CLI_PATH" ]]; then
  export CLI_PATH="$("$NODE_BINARY" --print "require.resolve('@expo/cli')")"
fi
if [[ -z "$BUNDLE_COMMAND" ]]; then
  export BUNDLE_COMMAND="export:embed"
fi
```

Verified directly — `@expo/cli export:embed --platform macos` produces a 1.2 MB
bundle from 703 modules. No workaround needed on the beta.

### Migration gotcha: copied `Pods/` breaks glog

When moving to a regenerated scaffold, do **not** copy `macos/Pods/` across and then
run `pod install` on top. CocoaPods treats glog as already installed and skips its
`prepare_command`, so the generated headers never appear and the build dies with

```
Pods/Headers/Public/React-debug/react/debug/react_native_assert.h:54:10:
  fatal error: 'glog/logging.h' file not found
```

`rm -rf macos/Pods && pod install` fixes it. Clearing DerivedData does **not** — the
headers genuinely aren't there.

## 6. Open questions

- **Radon IDE** keeps 13.14 GiB in `~/Library/Caches/com.swmansion.radon-ide/Devices`.
  Undocumented layout; needs investigation before classifying beyond Tier C.
- **`~/Library/Application Support/Claude` 12.70 GiB** and **Notion 10.06 GiB** — likely
  Electron caches mixed with unsynced local state. Needs per-app rules to separate.
- **`~/.expo` 13.72 GiB** — is `ios-simulator-app-cache` keyed by SDK version? If so it
  can be pruned to the current SDK only.
- Whether `getattrlistbulk` measurably beats `fts` on APFS at this inode count.
  Worth benchmarking once the `fts` scanner exists, not before.
- Whether Nitro's `{ ios: 'swift' }` platform spec really does yield a working macOS
  Swift implementation (§3). Confirm with a throwaway module returning a constant
  before building the scanner on it.
- Whether dropping `react-native-windows` breaks expo-desktop's autolinking (§5).
