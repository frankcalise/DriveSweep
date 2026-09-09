import { useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native'
import Svg, { Rect, G, Text as SvgText } from 'react-native-svg'

import type { CatalogEntry } from '../catalog'
import { squarify } from '../treemap'
import { color, tierColor, formatGiB } from './theme'

interface Props {
  entries: CatalogEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Live measurement when this machine has been scanned, else the snapshot. */
  sizeFor: (entry: CatalogEntry) => { gib: number; isLive: boolean }
}

/** Below this, a cell is too small for any text without clipping. */
const MIN_LABEL_W = 64
const MIN_LABEL_H = 30

export function Treemap({ entries, selectedId, onSelect, sizeFor }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 })

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize({ w: width, h: height })
  }

  const cells = useMemo(() => {
    const input = entries
      .map((e) => ({ datum: e, value: sizeFor(e).gib }))
      .filter((c) => c.value > 0)
    return squarify(input, { x: 0, y: 0, w: size.w, h: size.h })
  }, [entries, sizeFor, size.w, size.h])

  return (
    <View style={styles.container} onLayout={onLayout}>
      {size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h}>
          {cells.map(({ datum, x, y, w, h }) => {
            const selected = datum.id === selectedId
            const showLabel = w >= MIN_LABEL_W && h >= MIN_LABEL_H
            // Leave a hairline gutter so adjacent cells read as separate.
            const inset = 1

            return (
              <G key={datum.id}>
                <Rect
                  x={x + inset}
                  y={y + inset}
                  width={Math.max(0, w - inset * 2)}
                  height={Math.max(0, h - inset * 2)}
                  rx={3}
                  fill={tierColor[datum.tier]}
                  fillOpacity={selected ? 1 : 0.82}
                  stroke={selected ? color.text : 'transparent'}
                  strokeWidth={selected ? 2 : 0}
                />
                {/* react-native-svg inspects child element types, so these
                    stay direct siblings of <G> rather than a fragment. */}
                {showLabel && (
                  <SvgText
                    x={x + 9}
                    y={y + 19}
                    fill="#0B0D11"
                    fontSize={11}
                    fontWeight="600"
                  >
                    {truncate(datum.label, w)}
                  </SvgText>
                )}
                {showLabel && (
                  <SvgText
                    x={x + 9}
                    y={y + 33}
                    fill="#0B0D11"
                    fontSize={11}
                    opacity={0.75}
                  >
                    {formatGiB(sizeFor(datum).gib)}
                  </SvgText>
                )}
              </G>
            )
          })}
        </Svg>
      )}

      {/* Hit-testing lives here, not on the SVG nodes.
          react-native-svg's `onPress` on <G> delivers only the FIRST press on
          macOS — verified by invoking the handlers directly through the fiber
          tree, which updated state fine while clicking did not. So the SVG is
          paint-only and presses go through core RN's responder system. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {cells.map(({ datum, x, y, w, h }) => (
          <Pressable
            key={datum.id}
            onPress={() => onSelect(datum.id)}
            accessibilityRole="button"
            accessibilityLabel={`${datum.label}, ${formatGiB(
              sizeFor(datum).gib,
            )}, ${datum.tier}`}
            style={{ position: 'absolute', left: x, top: y, width: w, height: h }}
          />
        ))}
      </View>

      {cells.length === 0 && size.w > 0 && (
        <Text style={styles.empty}>No measured entries to display.</Text>
      )}
    </View>
  )
}

/** SVG text does not wrap or ellipsize, so clip to what the cell can hold. */
function truncate(label: string, width: number): string {
  const max = Math.floor((width - 18) / 6)
  return label.length <= max ? label : `${label.slice(0, Math.max(1, max - 1))}…`
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  empty: { color: color.textMuted, padding: 16 },
})
