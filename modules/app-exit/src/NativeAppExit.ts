import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  isSupported(): boolean;
  /**
   * Quit the app when its last window closes.
   *
   * Lives here rather than in the AppDelegate because macos/ is generated and
   * gitignored — an AppDelegate edit would not survive `prebuild`.
   */
  setQuitOnLastWindowClosed(enabled: boolean): void;
  requestExit(): void;
  completeExit(allow: boolean): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeAppExit");
