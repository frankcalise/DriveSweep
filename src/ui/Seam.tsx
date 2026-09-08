import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Animated, PanResponder, StyleSheet } from 'react-native'

import { color } from './theme'
import { cursorColResize, MacOSView } from './macos'

/** Grab strip width. The visible line stays 1px inside it. */
export const SEAM_WIDTH = 11

/** Long enough that skimming the pointer across doesn't flash the highlight. */
const HOVER_DELAY_MS = 500
/** Quick to appear once the delay has already been paid; gentler on the way out. */
const FADE_IN_MS = 140
const FADE_OUT_MS = 240

interface Props {
  /** Currently rendered panel width — anchors the grab. */
  panelWidth: number
  bodyWidth: number
  /** Receives the requested panel width. The caller clamps. */
  onResize: (panelWidth: number) => void
}

export function Seam({ panelWidth, bodyWidth, onResize }: Props) {
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)

  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read inside the PanResponder, which is built once — a responder rebuilt
  // mid-gesture drops the drag.
  const panelWidthRef = useRef(panelWidth)
  const bodyWidthRef = useRef(bodyWidth)
  const grabOffsetRef = useRef(0)
  panelWidthRef.current = panelWidth
  bodyWidthRef.current = bodyWidth

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
  }, [])

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Win the gesture before the treemap's Pressable overlay can claim it.
        onStartShouldSetPanResponderCapture: () => true,

        // PanResponder defaults this to `true`, which lets any other view take
        // the responder mid-drag — that is what made the drag stop partway.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: (_event, gesture) => {
          setDragging(true)
          // Where in the strip the pointer landed, so the seam doesn't jump.
          const seamLeft = bodyWidthRef.current - panelWidthRef.current - SEAM_WIDTH
          grabOffsetRef.current = gesture.x0 - seamLeft
        },

        // Driven by absolute pointer position (`moveX`), not accumulated `dx`.
        // `dx` is relative to the touch start, but the seam itself moves as the
        // panel resizes, so a delta-based drag drifts and stalls. `moveX` is
        // RCTTouchHandler's rootViewLocation.x (RCTTouchHandler.m:243), i.e.
        // root-relative and stable no matter where the seam has moved to.
        onPanResponderMove: (_event, gesture) => {
          const seamLeft = gesture.moveX - grabOffsetRef.current
          onResize(bodyWidthRef.current - seamLeft - SEAM_WIDTH)
        },

        onPanResponderRelease: () => setDragging(false),
        onPanResponderTerminate: () => setDragging(false),
      }),
    [onResize],
  )

  const active = hovered || dragging

  const glow = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(glow, {
      toValue: active ? 1 : 0,
      duration: active ? FADE_IN_MS : FADE_OUT_MS,
      // JS driver deliberately: with `useNativeDriver: true` the bar never
      // appeared on macOS. Not investigated far enough to say why — the JS
      // driver works and this is one opacity on one small view, so it costs
      // nothing. React-RCTAnimation IS in the macOS Pods, so it was never a
      // missing-module problem.
      //
      // Careful when changing this flag: an Animated.Value is promoted to
      // "native" permanently, and the useRef holding it survives Fast Refresh,
      // so flipping the flag throws
      //   "Attempting to run JS driven animation on animated node that has been
      //    moved to native earlier"
      // until the app is fully reloaded. Restart rather than assume you broke it.
      useNativeDriver: false,
    }).start()
  }, [active, glow])

  // Cross-fade: the grip recedes as the accent bar comes up.
  const gripOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  })

  return (
    <MacOSView
      style={[styles.seam, cursorColResize]}
      onMouseEnter={() => {
        hoverTimer.current = setTimeout(() => setHovered(true), HOVER_DELAY_MS)
      }}
      onMouseLeave={() => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        setHovered(false)
      }}
      {...pan.panHandlers}
    >
      <View style={styles.line} />
      <Animated.View style={[styles.lineActive, { opacity: glow }]} />
      <Animated.View style={[styles.grip, { opacity: gripOpacity }]} />
    </MacOSView>
  )
}

const styles = StyleSheet.create({
  seam: {
    width: SEAM_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
  line: {
    position: 'absolute',
    left: 5,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: color.border,
  },
  // Full-height accent bar, the way VS Code marks an active splitter.
  lineActive: {
    position: 'absolute',
    left: 4,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: color.accent,
  },
  grip: { width: 3, height: 30, borderRadius: 2, backgroundColor: color.border },
})
