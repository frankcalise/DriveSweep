import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  /** JSON in / JSON out. Resolves when every root has been walked. */
  scanRoots(pathsJson: string, optionsJson: string): Promise<string>;
  /**
   * Aggregate every directory under a root whose basename matches, for catalog
   * entries written as globs. JSON in / JSON out.
   */
  matchDirs(specJson: string): Promise<string>;
  /** Cooperative cancel; the walk checks between entries. */
  cancel(): void;
  /**
   * Whether each path exists and can be enumerated. Synchronous and cheap.
   *
   * Replaces a global Full Disk Access probe, which cannot be answered
   * reliably — TCC.db is SIP-protected beyond FDA on current macOS, so the
   * usual probe reports false even when access is granted.
   */
  checkPaths(pathsJson: string): string;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeDiskScanner");
