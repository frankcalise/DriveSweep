/**
 * DriveSweep catalog of known developer disk hotspots.
 *
 * `measuredGiB` is a real observation from the machine documented in
 * docs/DISCOVERY.md (2026-09-07), kept so the UI can be built against
 * realistic data before the native scanner exists. It is NOT a default or
 * an estimate for other machines — the scanner overwrites it.
 */

/**
 * What it costs to get this data back.
 *
 * - `safe`     regenerates automatically, locally, in seconds
 * - `redownload` regenerates, but over the network; breaks offline work
 * - `caution`  regenerates, but you lose state you'll miss later
 * - `keep`     not safely removable by unlinking files
 */
export type Tier = 'safe' | 'redownload' | 'caution' | 'keep'

/** How space is actually reclaimed. */
export type Reclaim =
  /** Unlink the path directly. */
  | { via: 'delete' }
  /** Only the owning tool can do this safely; show the command, don't unlink. */
  | { via: 'command'; command: string; enumerate?: string }
  /** Never offer automatically. */
  | { via: 'manual' }

export interface CatalogEntry {
  id: string
  /** `~` is expanded at scan time. */
  path: string
  label: string
  /** Owning tool, for grouping in the UI. */
  tool: string
  tier: Tier
  reclaim: Reclaim
  /** What brings it back, in the developer's own terms. */
  regeneratedBy: string
  /** Empty when nothing is lost. */
  youLose?: string
  /** Non-obvious behaviour the UI must surface. See docs/DISCOVERY.md §3. */
  caveat?: string
  /**
   * Set when this entry lives INSIDE another entry. Such entries must be
   * excluded from any total or treemap, or their bytes are counted twice.
   */
  subsetOf?: string
  measuredGiB?: number
}

export const CATALOG: CatalogEntry[] = [
  // ---------------------------------------------------------------- Xcode
  {
    id: 'xcode-derived-data',
    path: '~/Library/Developer/Xcode/DerivedData',
    label: 'Xcode build products & indexes',
    tool: 'Xcode',
    tier: 'safe',
    reclaim: { via: 'delete' },
    regeneratedBy: 'The next build. First build after is slow; indexing re-runs.',
    measuredGiB: 29.13,
  },
  {
    id: 'sim-dyld-cache',
    path: '/Library/Developer/CoreSimulator/Caches/dyld',
    label: 'Simulator dyld shared caches',
    tool: 'Xcode',
    tier: 'safe',
    reclaim: { via: 'delete' },
    regeneratedBy: 'First launch of each simulator runtime.',
    caveat:
      'Lives under /Library, not ~/Library, so most GUI disk tools never show it. ' +
      'Requires admin to remove.',
    measuredGiB: 23.87,
  },
  {
    id: 'xcode-ios-device-support',
    path: '~/Library/Developer/Xcode/iOS DeviceSupport',
    label: 'iOS device symbol caches',
    tool: 'Xcode',
    tier: 'caution',
    reclaim: { via: 'delete' },
    regeneratedBy:
      'Re-fetched only when you next connect a physical device on that iOS build.',
    youLose:
      'Symbolication for existing crash logs from those builds. Re-pairing a device ' +
      'takes several minutes.',
    measuredGiB: 11.07,
  },
  {
    id: 'xcode-archives',
    path: '~/Library/Developer/Xcode/Archives',
    label: 'Xcode archives (.xcarchive)',
    tool: 'Xcode',
    tier: 'keep',
    reclaim: { via: 'manual' },
    regeneratedBy: 'Nothing — these are build outputs you chose to keep.',
    youLose:
      'dSYMs for shipped builds. Without them you cannot symbolicate production ' +
      'crash reports.',
    measuredGiB: 2.66,
  },

  // ------------------------------------------------------------ Simulators
  {
    id: 'sim-devices',
    path: '~/Library/Developer/CoreSimulator/Devices',
    label: 'Simulator devices & app data',
    tool: 'CoreSimulator',
    tier: 'caution',
    reclaim: {
      via: 'command',
      command: 'xcrun simctl erase <udid>',
      enumerate: 'xcrun simctl list devices -j',
    },
    regeneratedBy: 'Re-installing your dev builds.',
    youLose:
      'Installed apps, app data, logins, granted permissions, simulator keychains.',
    caveat:
      'Never delete files under a Booted device — check simctl state first. Most of ' +
      'the size is usually data/Containers/Data (app data), which `simctl erase` ' +
      'clears without touching the runtime.',
    measuredGiB: 98.36,
  },
  {
    id: 'sim-runtimes',
    path: '/Library/Developer/CoreSimulator/Cryptex/Images',
    label: 'Simulator runtimes (iOS images)',
    tool: 'CoreSimulator',
    tier: 'caution',
    reclaim: {
      via: 'command',
      command: 'xcrun simctl runtime delete <id>',
      enumerate: 'xcrun simctl runtime list -j',
    },
    regeneratedBy: 'Re-downloading the runtime from Apple (multi-GB, slow).',
    youLose: 'Every simulator device on that runtime becomes unavailable.',
    caveat:
      'Read-only APFS volumes mounted nobrowse. `du -x` cannot see them at all. ' +
      'Size must come from simctl, not the filesystem.',
    measuredGiB: 56.1,
  },
  {
    id: 'sim-unavailable',
    path: '~/Library/Developer/CoreSimulator/Devices',
    label: 'Orphaned devices (runtime removed)',
    tool: 'CoreSimulator',
    tier: 'safe',
    reclaim: { via: 'command', command: 'xcrun simctl delete unavailable' },
    regeneratedBy: 'Nothing — these reference runtimes that no longer exist.',
    caveat: 'Subset of sim-devices; do not add its size to the total twice.',
    subsetOf: 'sim-devices',
  },

  // -------------------------------------------------------------- CocoaPods
  {
    id: 'cocoapods-react-core-prebuilt',
    path: '~/Library/Caches/CocoaPods/Pods/External/React-Core-prebuilt',
    label: 'React Native prebuilt Core artifacts',
    tool: 'CocoaPods',
    tier: 'redownload',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Next `pod install` re-downloads for that RN version.',
    caveat:
      'RN 0.81+ caches prebuilt Core per version AND per build config. Nothing in ' +
      'the RN toolchain ever prunes it — the biggest single win on a multi-project ' +
      'RN machine.',
    subsetOf: 'cocoapods-cache',
    measuredGiB: 44.84,
  },
  {
    id: 'cocoapods-cache',
    path: '~/Library/Caches/CocoaPods',
    label: 'CocoaPods download cache',
    tool: 'CocoaPods',
    tier: 'redownload',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Next `pod install`.',
    caveat: 'Includes React-Core-prebuilt — count one or the other, not both.',
    measuredGiB: 63.34,
  },
  {
    id: 'project-pods',
    path: '~/code/*/ios/Pods',
    label: 'Per-project installed Pods',
    tool: 'CocoaPods',
    tier: 'redownload',
    reclaim: { via: 'delete' },
    regeneratedBy: '`pod install` in that project.',
    caveat: 'Needs Podfile.lock present, else versions may drift.',
    measuredGiB: 5.94,
  },

  // ----------------------------------------------------------------- Android
  {
    id: 'android-system-images',
    path: '~/Library/Android/sdk/system-images',
    label: 'Android emulator system images',
    tool: 'Android SDK',
    tier: 'caution',
    reclaim: {
      via: 'command',
      command: 'sdkmanager --uninstall "system-images;android-NN;..."',
      enumerate: 'sdkmanager --list_installed',
    },
    regeneratedBy: 'Re-downloading via sdkmanager.',
    youLose: 'Any AVD referencing a removed image stops booting.',
    measuredGiB: 26.29,
  },
  {
    id: 'android-ndk',
    path: '~/Library/Android/sdk/ndk',
    label: 'Android NDK versions',
    tool: 'Android SDK',
    tier: 'caution',
    reclaim: {
      via: 'command',
      command: 'sdkmanager --uninstall "ndk;<version>"',
      enumerate: 'sdkmanager --list_installed',
    },
    regeneratedBy: 'Re-downloading the specific version.',
    youLose: 'Builds pinned to a removed NDK fail outright.',
    caveat:
      'Measured 8 versions coexisting (21.4 → 27.1). Read ndkVersion from each ' +
      "project's build.gradle / gradle.properties before recommending removal.",
    measuredGiB: 21.24,
  },
  {
    id: 'android-avd',
    path: '~/.android/avd',
    label: 'Android virtual devices',
    tool: 'Android SDK',
    tier: 'caution',
    reclaim: { via: 'command', command: 'avdmanager delete avd -n <name>' },
    regeneratedBy: 'Recreating the AVD and re-installing apps.',
    youLose: 'AVD definition, installed apps, app data, snapshots.',
    caveat:
      'Wiping just userdata-qemu.img / snapshots reclaims most of it while keeping ' +
      'the AVD definition.',
    measuredGiB: 17.19,
  },
  {
    id: 'gradle-caches',
    path: '~/.gradle',
    label: 'Gradle caches & wrappers',
    tool: 'Gradle',
    tier: 'redownload',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Next Gradle build re-downloads dependencies and wrappers.',
    measuredGiB: 8.14,
  },
  {
    id: 'project-android-build',
    path: '~/code/*/android/**/build',
    label: 'Per-project Android build output',
    tool: 'Gradle',
    tier: 'safe',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Next Gradle build.',
    caveat:
      'Measured 12.54 GiB naively but only 7.04 GiB outside node_modules — must ' +
      'prune node_modules first or it double-counts.',
    measuredGiB: 7.04,
  },

  // ------------------------------------------------------- JS package managers
  {
    id: 'npm-cacache',
    path: '~/.npm/_cacache',
    label: 'npm content-addressable cache',
    tool: 'npm',
    tier: 'redownload',
    reclaim: { via: 'command', command: 'npm cache clean --force' },
    regeneratedBy: 'Next `npm install`.',
    measuredGiB: 33.39,
  },
  {
    id: 'npm-npx',
    path: '~/.npm/_npx',
    label: 'npx one-off package installs',
    tool: 'npm',
    tier: 'redownload',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Re-fetched on demand next time you npx that package.',
    measuredGiB: 4.13,
  },
  {
    id: 'bun-cache',
    path: '~/.bun/install/cache',
    label: 'Bun install cache',
    tool: 'Bun',
    tier: 'redownload',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Next `bun install`.',
    measuredGiB: 16.64,
  },
  {
    id: 'pnpm-store',
    path: '~/Library/pnpm',
    label: 'pnpm content-addressable store',
    tool: 'pnpm',
    tier: 'redownload',
    reclaim: { via: 'command', command: 'pnpm store prune' },
    regeneratedBy: 'Next `pnpm install`.',
    caveat:
      'Hardlinked into every pnpm node_modules. Deleting linked copies elsewhere ' +
      'frees nothing until the last link goes. Must de-dupe by inode.',
    measuredGiB: 14.68,
  },
  {
    id: 'pnpm-cache',
    path: '~/Library/Caches/pnpm',
    label: 'pnpm metadata & side cache',
    tool: 'pnpm',
    tier: 'redownload',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Next `pnpm install`.',
    measuredGiB: 4.49,
  },
  {
    id: 'yarn-cache',
    path: '~/.yarn',
    label: 'Yarn cache',
    tool: 'Yarn',
    tier: 'redownload',
    reclaim: { via: 'command', command: 'yarn cache clean' },
    regeneratedBy: 'Next `yarn install`.',
    measuredGiB: 5.05,
  },
  {
    id: 'node-modules',
    path: '~/code/**/node_modules',
    label: 'Project node_modules',
    tool: 'Node',
    tier: 'redownload',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Reinstall in each project.',
    caveat:
      'Measured 257 dirs / 32.03 GiB — 56% of ~/code. Safe only where a lockfile ' +
      'exists and resolves; treat lockfile-less projects as keep.',
    measuredGiB: 32.03,
  },

  // -------------------------------------------------------------------- Expo
  {
    id: 'expo-simulator-app-cache',
    path: '~/.expo/ios-simulator-app-cache',
    label: 'Expo Go / dev client iOS builds',
    tool: 'Expo',
    tier: 'redownload',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Re-downloaded on next `expo start` for that SDK.',
    measuredGiB: 6.78,
  },
  {
    id: 'expo-go',
    path: '~/.expo/expo-go',
    label: 'Expo Go app versions',
    tool: 'Expo',
    tier: 'redownload',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Re-downloaded on demand.',
    measuredGiB: 4.34,
  },
  {
    id: 'expo-android-apk-cache',
    path: '~/.expo/android-apk-cache',
    label: 'Expo Android APK cache',
    tool: 'Expo',
    tier: 'redownload',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Re-downloaded on demand.',
    measuredGiB: 2.38,
  },

  // ----------------------------------------------------------- Editors / misc
  {
    id: 'radon-ide-devices',
    path: '~/Library/Caches/com.swmansion.radon-ide/Devices',
    label: 'Radon IDE device state',
    tool: 'Radon IDE',
    tier: 'caution',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Radon recreates devices on next use.',
    youLose: 'Radon device state and installed builds.',
    caveat: 'Undocumented layout — see docs/PLATFORM.md §5.',
    measuredGiB: 13.14,
  },
  {
    id: 'ccache',
    path: '~/Library/Caches/ccache',
    label: 'ccache compiler cache',
    tool: 'ccache',
    tier: 'safe',
    reclaim: { via: 'command', command: 'ccache --clear' },
    regeneratedBy: 'Rebuilds; slower until warm again.',
    measuredGiB: 5.0,
  },
  {
    id: 'typescript-cache',
    path: '~/Library/Caches/typescript',
    label: 'TypeScript / tsserver cache',
    tool: 'TypeScript',
    tier: 'safe',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Next tsc run or editor session.',
    measuredGiB: 2.83,
  },
  {
    id: 'playwright-browsers',
    path: '~/Library/Caches/ms-playwright',
    label: 'Playwright browser binaries',
    tool: 'Playwright',
    tier: 'redownload',
    reclaim: { via: 'command', command: 'npx playwright install' },
    regeneratedBy: '`playwright install`.',
    measuredGiB: 0.77,
  },
  {
    id: 'cypress-cache',
    path: '~/Library/Caches/Cypress',
    label: 'Cypress binaries',
    tool: 'Cypress',
    tier: 'redownload',
    reclaim: { via: 'command', command: 'npx cypress install' },
    regeneratedBy: 'Cypress postinstall.',
    measuredGiB: 0.52,
  },
  {
    id: 'user-logs',
    path: '~/Library/Logs',
    label: 'Application logs',
    tool: 'macOS',
    tier: 'safe',
    reclaim: { via: 'delete' },
    regeneratedBy: 'Continuously. Nothing reads old logs.',
    measuredGiB: 3.94,
  },

  // ---------------------------------------------------------- Owning-tool only
  {
    id: 'docker',
    path: '~/Library/Containers/com.docker.docker',
    label: 'Docker VM disk, images & volumes',
    tool: 'Docker',
    tier: 'keep',
    reclaim: {
      via: 'command',
      command: 'docker system prune',
      enumerate: 'docker system df',
    },
    regeneratedBy: 'Re-pulling images; volumes are NOT regenerable.',
    youLose: 'Deleting Docker.raw destroys every container volume.',
    caveat:
      'Docker.raw is sparse: 60 GB apparent vs 8.1 GB actual. Sizing from st_size ' +
      'over-reports 7.4x.',
    measuredGiB: 8.13,
  },
  {
    id: 'homebrew',
    path: '/opt/homebrew',
    label: 'Homebrew prefix',
    tool: 'Homebrew',
    tier: 'keep',
    reclaim: {
      via: 'command',
      command: 'brew cleanup',
      enumerate: 'brew cleanup -n',
    },
    regeneratedBy: 'Reinstalling formulae.',
    youLose: 'Installed tools, if you delete files rather than using brew.',
    measuredGiB: 9.31,
  },
  {
    id: 'asdf',
    path: '~/.asdf',
    label: 'asdf toolchains',
    tool: 'asdf',
    tier: 'keep',
    reclaim: {
      via: 'command',
      command: 'asdf uninstall <plugin> <version>',
      enumerate: 'asdf list',
    },
    regeneratedBy: 'Reinstalling each language version.',
    youLose: 'Every shim breaks — node, ruby, java all stop resolving.',
    caveat:
      'A stale ~/.asdf_backup_20251022 (2.67 GiB) was also measured; safe to remove ' +
      'once the current install is verified working.',
    measuredGiB: 3.79,
  },
]

/** Paths that must never be offered for automatic deletion. */
export const NEVER_TOUCH: readonly string[] = [
  '~/code/**/.git',
  '~/Documents',
  '~/Desktop',
  '~/Downloads',
  '~/Library/Application Support',
  '~/Library/Group Containers',
  '~/Library/Keychains',
  '/Applications',
  '/System',
]

export const TIER_ORDER: readonly Tier[] = ['safe', 'redownload', 'caution', 'keep']

/**
 * Entries safe to sum or lay out spatially — drops anything nested inside
 * another entry. Always use this rather than CATALOG for totals.
 */
export function topLevelEntries(entries: CatalogEntry[] = CATALOG): CatalogEntry[] {
  return entries.filter((e) => e.subsetOf === undefined)
}
