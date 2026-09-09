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
   * Whether the app can read TCC-protected locations. Denial is SILENT —
   * protected directories read back empty rather than erroring — so this must
   * be checked before any number is shown.
   */
  hasFullDiskAccess(): boolean;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeDiskScanner");
