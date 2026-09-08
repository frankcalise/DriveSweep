/**
 * Typed escapes for react-native-macos features that core React Native's
 * TypeScript definitions don't know about.
 *
 * The app imports from `react-native`, which TypeScript resolves to core RN's
 * types. react-native-macos implements strictly more than that — but the types
 * shipped for it aren't what `import 'react-native'` picks up, so these values
 * are invisible to the compiler even though the native side handles them.
 *
 * Everything here is verified against the installed react-native-macos source,
 * with the file noted. Keep the casts confined to this module.
 */

import { View, type ViewProps, type ViewStyle } from 'react-native'
import type { ComponentType } from 'react'

/**
 * The full CSS cursor set is supported:
 * `react-native-macos/Libraries/StyleSheet/StyleSheetTypes.d.ts` lists
 * 'col-resize', 'ew-resize' and ~30 others, and
 * `React/Views/RCTCursor.m` maps them to NSCursor
 * (RCTCursorColResize / RCTCursorEWResize → `[NSCursor resizeLeftRightCursor]`).
 *
 * Core RN's `CursorValue` is only 'auto' | 'pointer', hence the cast.
 */
export const cursorColResize = { cursor: 'col-resize' } as unknown as ViewStyle

/**
 * `onMouseEnter` / `onMouseLeave` exist on View in
 * `react-native-macos/Libraries/Components/View/ViewPropTypes.d.ts:140`.
 * They are the only hover signal on macOS — `Pressable`'s `onHoverIn` is not
 * wired up for this platform.
 */
export type MacOSViewProps = ViewProps & {
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

/** `View`, with the macOS-only mouse props visible to TypeScript. */
export const MacOSView = View as ComponentType<MacOSViewProps>
