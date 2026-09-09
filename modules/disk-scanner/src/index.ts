import { NativeEventEmitter, Platform } from "react-native";
import NativeDiskScanner from "./NativeDiskScanner";

export type ScannedRoot = Readonly<{
  path: string;
  /** False when the path does not exist on this machine. */
  present: boolean;
  /** Disk usage from `st_blocks * 512` — actual blocks, not apparent size. */
  bytes: number;
  files: number;
  dirs: number;
  /** Entries skipped because another hardlink to the same inode was counted. */
  dedupedInodes: number;
  /** Entries that could not be read — usually a TCC denial. */
  unreadable: number;
  cancelled: boolean;
  elapsedMs: number;
}>;

export type ScanRootEvent = ScannedRoot &
  Readonly<{ index: number; total: number }>;

export type ScanResult = Readonly<{
  roots: ScannedRoot[];
  cancelled: boolean;
  elapsedMs: number;
}>;

export type ScanOptions = Readonly<{
  /**
   * Follow into mounted volumes. Off by default so mounts aren't folded into a
   * parent's total. Note simulator runtimes live on separate `nobrowse` APFS
   * volumes and are invisible either way — they need `simctl`, not a walk.
   */
  crossDevices?: boolean;
}>;

const EMPTY: ScanResult = {
  roots: [],
  cancelled: false,
  elapsedMs: 0,
};

export const isDiskScannerSupported = Platform.OS === "macos";

function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Walk `paths` and report disk usage per root. Resolves when all roots finish;
 * subscribe with `addRootCompleteListener` to fill the UI as each one lands.
 */
export function scanRoots(
  paths: readonly string[],
  options: ScanOptions = {},
): Promise<ScanResult> {
  if (!isDiskScannerSupported) {
    return Promise.resolve(EMPTY);
  }
  return NativeDiskScanner.scanRoots(
    JSON.stringify(paths),
    JSON.stringify(options),
  ).then((json) => parseJson<ScanResult>(json, EMPTY));
}

export type MatchDirsSpec = Readonly<{
  root: string;
  /** Directory basename to match, e.g. "node_modules". */
  matchDirName: string;
  /** Optional extra constraint on the full path, e.g. "/android/". */
  requirePathContains?: string;
  /** Never descended into. Pass ["node_modules"] to avoid double-counting. */
  excludeDirNames?: readonly string[];
}>;

export type MatchDirsResult = ScannedRoot & Readonly<{ matches: number }>;

const EMPTY_MATCH: MatchDirsResult = {
  path: "",
  present: false,
  bytes: 0,
  files: 0,
  dirs: 0,
  matches: 0,
  dedupedInodes: 0,
  unreadable: 0,
  cancelled: false,
  elapsedMs: 0,
};

/**
 * Total every directory under `root` matching `matchDirName`.
 *
 * Matches are pruned, so a directory's contents count once and the walk does
 * not descend into it again.
 */
export function matchDirs(spec: MatchDirsSpec): Promise<MatchDirsResult> {
  if (!isDiskScannerSupported) {
    return Promise.resolve(EMPTY_MATCH);
  }
  return NativeDiskScanner.matchDirs(JSON.stringify(spec)).then((json) =>
    parseJson<MatchDirsResult>(json, EMPTY_MATCH),
  );
}

/** Cooperative cancel. The walk checks between entries. */
export function cancelScan(): void {
  if (isDiskScannerSupported) {
    NativeDiskScanner.cancel();
  }
}

export type PathCheck = Readonly<{
  path: string;
  exists: boolean;
  /** `opendir` succeeded. */
  readable: boolean;
  /** Entries seen, capped at 8. Zero on an existing directory suggests denial. */
  entries: number;
}>;

/**
 * Check whether specific paths can actually be enumerated.
 *
 * Prefer this over asking "do we have Full Disk Access". That question has no
 * reliable answer — TCC.db is SIP-protected beyond FDA on current macOS, so
 * the conventional probe reports false even when access has been granted — and
 * it is the wrong question anyway: an unsandboxed app can read most of
 * ~/Library without FDA. What matters is the paths in front of us.
 */
export function checkPaths(paths: readonly string[]): PathCheck[] {
  if (!isDiskScannerSupported) return [];
  return parseJson<PathCheck[]>(NativeDiskScanner.checkPaths(JSON.stringify(paths)), []);
}

export function addRootCompleteListener(
  listener: (event: ScanRootEvent) => void,
): { remove: () => void } {
  if (!isDiskScannerSupported) {
    return { remove: () => {} };
  }
  const emitter = new NativeEventEmitter(NativeDiskScanner as never);
  const subscription = emitter.addListener("onRootComplete", listener);
  return { remove: () => subscription.remove() };
}

export { NativeDiskScanner };

// Dev-only handle so the scanner can be exercised from the Metro inspector.
// There is no way to screenshot this app here, so verifying numbers means
// driving it over CDP; see README "Debugging".
declare const __DEV__: boolean
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  ;(globalThis as unknown as Record<string, unknown>).__driveSweepScanner = {
    scanRoots,
    matchDirs,
    cancelScan,
    checkPaths,
  }
}
