import { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'

import { CATALOG, TIER_ORDER, topLevelEntries, type CatalogEntry } from './src/catalog'
import { buildPlan } from './src/actions'
import { Treemap } from './src/ui/Treemap'
import { Seam, SEAM_WIDTH } from './src/ui/Seam'
import {
  color,
  tierColor,
  tierLabel,
  tierBlurb,
  formatGiB,
  shortPath,
} from './src/ui/theme'

const DEFAULT_PANEL_WIDTH = 420
/** Below this the panel's own content stops being readable. */
const MIN_PANEL_WIDTH = 300
/** Keep enough treemap that the small cells stay clickable. */
const MIN_TREEMAP_WIDTH = 320

export default function App() {
  const entries = useMemo(() => topLevelEntries(CATALOG), [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
  const [bodyWidth, setBodyWidth] = useState(0)

  const selected = entries.find((e) => e.id === selectedId) ?? null

  // The seam consumes width too, so it comes out of the budget.
  const maxPanelWidth = (body: number) =>
    Math.max(MIN_PANEL_WIDTH, body - MIN_TREEMAP_WIDTH - SEAM_WIDTH)

  // Clamping lives here, not in Seam: only App knows the minimums.
  const onResize = useCallback(
    (requested: number) =>
      setPanelWidth(
        Math.min(maxPanelWidth(bodyWidth), Math.max(MIN_PANEL_WIDTH, requested)),
      ),
    [bodyWidth],
  )

  // Re-clamp on window resize without needing an effect: if the window shrank,
  // the stored width is capped for this render but not overwritten, so widening
  // the window again restores the user's chosen size.
  const effectivePanelWidth =
    bodyWidth > 0 ? Math.min(panelWidth, maxPanelWidth(bodyWidth)) : panelWidth

  const totals = useMemo(() => {
    const byTier = Object.fromEntries(
      TIER_ORDER.map((t) => [
        t,
        entries
          .filter((e) => e.tier === t)
          .reduce((sum, e) => sum + (e.measuredGiB ?? 0), 0),
      ]),
    ) as Record<(typeof TIER_ORDER)[number], number>
    const all = Object.values(byTier).reduce((a, b) => a + b, 0)
    return { byTier, all }
  }, [entries])

  const onBodyLayout = (e: LayoutChangeEvent) =>
    setBodyWidth(e.nativeEvent.layout.width)

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>DriveSweep</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {formatGiB(totals.all)} catalogued across {entries.length} developer
            hotspots · snapshot of 2026-09-07, preview only
          </Text>
        </View>
        <View style={styles.legend}>
          {TIER_ORDER.map((tier) => (
            <View key={tier} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: tierColor[tier] }]} />
              <View>
                <Text style={styles.legendLabel}>{tierLabel[tier]}</Text>
                <Text style={styles.legendValue}>
                  {formatGiB(totals.byTier[tier])}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.body} onLayout={onBodyLayout}>
        <Treemap entries={entries} selectedId={selectedId} onSelect={setSelectedId} />
        {selected && (
          <Seam
            panelWidth={effectivePanelWidth}
            bodyWidth={bodyWidth}
            onResize={onResize}
          />
        )}
        {selected && (
          <DetailPanel
            entry={selected}
            width={effectivePanelWidth}
            onClose={() => setSelectedId(null)}
          />
        )}
      </View>
    </View>
  )
}

function DetailPanel({
  entry,
  width,
  onClose,
}: {
  entry: CatalogEntry
  width: number
  onClose: () => void
}) {
  const step = buildPlan([entry], [entry.id]).steps[0]

  return (
    <ScrollView style={[styles.panel, { width }]} contentContainerStyle={styles.panelContent}>
      <View style={styles.panelHeader}>
        <View style={[styles.tierPill, { backgroundColor: tierColor[entry.tier] }]}>
          <Text style={styles.tierPillText}>{tierLabel[entry.tier].toUpperCase()}</Text>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close details"
          hitSlop={8}
          style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}
        >
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
      </View>

      {/* Keeps the meaning of the colour visible now that the tier legend is
          no longer a standing placeholder panel. */}
      <Text style={styles.tierMeaning}>{tierBlurb[entry.tier]}</Text>

      <Text style={styles.entryLabel}>{entry.label}</Text>
      <Text style={styles.entrySize}>{formatGiB(entry.measuredGiB ?? 0)}</Text>
      <Text style={styles.entryPath}>{shortPath(entry.path)}</Text>

      <Field label="Owned by" value={entry.tool} />
      <Field label="Comes back via" value={entry.regeneratedBy} />
      {entry.youLose && <Field label="You lose" value={entry.youLose} warn />}
      {entry.caveat && <Field label="Watch out" value={entry.caveat} warn />}

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Reclaim</Text>
      <Text style={styles.stepText}>{step.description}</Text>
      {entry.reclaim.via === 'command' && (
        <View style={styles.code}>
          <Text style={styles.codeText}>{entry.reclaim.command}</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>
        Preconditions ({step.guards.length}) — none implemented
      </Text>
      {step.guards.map((guard) => (
        <View key={guard} style={styles.guardRow}>
          <View style={styles.guardBox} />
          <Text style={styles.guardText}>{guard}</Text>
        </View>
      ))}

      <Pressable
        disabled
        style={styles.disabledButton}
        accessibilityState={{ disabled: true }}
      >
        <Text style={styles.disabledButtonText}>
          Reclaim {formatGiB(entry.measuredGiB ?? 0)}
        </Text>
      </Pressable>
      <Text style={styles.disabledNote}>
        Deleting is not implemented. DriveSweep is preview-only — see
        src/actions.ts.
      </Text>
    </ScrollView>
  )
}

function Field({
  label,
  value,
  warn = false,
}: {
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, warn && styles.fieldValueWarn]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  headerTitle: { flexShrink: 1, paddingRight: 16 },
  title: { color: color.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  subtitle: { color: color.textMuted, fontSize: 12, marginTop: 3 },

  legend: { flexDirection: 'row', gap: 18, flexShrink: 0 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { color: color.textMuted, fontSize: 11 },
  legendValue: { color: color.text, fontSize: 12, fontWeight: '600' },

  body: { flex: 1, flexDirection: 'row' },


  // ScrollView bakes in `flexGrow: 1, flexShrink: 1` (ScrollView.js baseVertical),
  // which makes an explicit `width` act as a flex BASIS the view then grows past —
  // it was rendering ~997px wide for a requested 300. Pin the flex factors so the
  // width the seam sets is the width you get.
  panel: { backgroundColor: color.panel, flexGrow: 0, flexShrink: 0 },
  panelContent: { padding: 18, paddingBottom: 32 },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  closeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  closePressed: { backgroundColor: color.panelRaised },
  closeGlyph: { color: color.textMuted, fontSize: 13, lineHeight: 16 },

  tierMeaning: { color: color.textFaint, fontSize: 11, marginTop: 8 },

  tierPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  tierPillText: {
    color: '#0B0D11',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  entryLabel: {
    color: color.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 10,
    letterSpacing: -0.2,
  },
  entrySize: { color: color.text, fontSize: 26, fontWeight: '700', marginTop: 4 },
  entryPath: {
    color: color.textFaint,
    fontSize: 11,
    fontFamily: 'Menlo',
    marginTop: 4,
    marginBottom: 4,
  },

  field: { marginTop: 14 },
  fieldLabel: {
    color: color.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  fieldValue: { color: color.textMuted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  fieldValueWarn: { color: '#E0B577' },

  divider: { height: 1, backgroundColor: color.border, marginVertical: 16 },

  sectionTitle: {
    color: color.text,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 7,
  },
  stepText: { color: color.textMuted, fontSize: 12, lineHeight: 18 },

  code: {
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 5,
    padding: 9,
    marginTop: 8,
  },
  codeText: { color: '#9FD3B0', fontSize: 11, fontFamily: 'Menlo' },

  guardRow: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 8,
    // Keeps the box on the FIRST line when the text wraps to several.
    alignItems: 'flex-start',
  },
  // A drawn box rather than the ☐ glyph: glyph metrics differ per font and put
  // the mark on a different baseline than the label.
  guardBox: {
    width: 11,
    height: 11,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: color.textFaint,
    // (lineHeight 16 - box 11) / 2 — optically centres against the first line.
    marginTop: 3,
  },
  guardText: { color: color.textFaint, fontSize: 11, lineHeight: 16, flex: 1 },

  disabledButton: {
    marginTop: 20,
    backgroundColor: color.panelRaised,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 6,
    paddingVertical: 11,
    alignItems: 'center',
    opacity: 0.55,
  },
  disabledButtonText: { color: color.textMuted, fontSize: 13, fontWeight: '600' },
  disabledNote: {
    color: color.textFaint,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
    textAlign: 'center',
  },
})
