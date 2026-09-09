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
  hasFullDiskAccess: boolean;
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
  hasFullDiskAccess: false,
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

/** Cooperative cancel. The walk checks between entries. */
export function cancelScan(): void {
  if (isDiskScannerSupported) {
    NativeDiskScanner.cancel();
  }
}

/**
 * Whether the app can read TCC-protected locations.
 *
 * This must gate the UI. Without Full Disk Access macOS returns *empty*
 * directory listings rather than errors, so a scan reports 0 GiB and looks
 * like a clean disk instead of a failure.
 */
export function hasFullDiskAccess(): boolean {
  return isDiskScannerSupported ? NativeDiskScanner.hasFullDiskAccess() : false;
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
