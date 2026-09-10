import { View, Text, Pressable, Linking, StyleSheet } from 'react-native'

import { color } from './theme'

const SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'

/**
 * Shown when none of the representative catalog roots read back any entries.
 *
 * Still worth having even though Full Disk Access turned out to be unnecessary
 * (see docs/DISCOVERY.md gotcha 7), because the likely cause changed rather
 * than disappearing: `macos/` is generated and gitignored, so every `prebuild`
 * restores the App Sandbox until `scripts/apply-native-patches.sh` is re-run.
 * A sandboxed build reads nothing.
 *
 * The reason it must be a hard gate is unchanged: macOS returns protected
 * directories as *empty* rather than refusing, so the alternative is a treemap
 * of zeros that looks like a spotless disk.
 */
export function AccessGate({ onRecheck }: { onRecheck: () => void }) {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Can't read your Library</Text>
        <Text style={styles.body}>
          DriveSweep reads <Text style={styles.mono}>~/Library</Text>,{' '}
          <Text style={styles.mono}>/Library/Developer</Text> and similar to
          measure what your tools have cached. None of them returned anything.
        </Text>
        <Text style={styles.body}>
          macOS reports directories it is withholding as{' '}
          <Text style={styles.em}>empty</Text> rather than refusing, so showing
          numbers now would read zero and look like a clean disk.
        </Text>
        <Text style={styles.body}>
          Almost always this means the build is sandboxed — a{' '}
          <Text style={styles.mono}>prebuild</Text> regenerates{' '}
          <Text style={styles.mono}>macos/</Text> and restores the sandbox:
        </Text>
        <View style={styles.code}>
          <Text style={styles.codeText}>./scripts/apply-native-patches.sh</Text>
          <Text style={styles.codeText}>bun run macos</Text>
        </View>

        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={onRecheck}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Check again</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            onPress={() => Linking.openURL(SETTINGS_URL)}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Full Disk Access…</Text>
          </Pressable>
        </View>
        <Text style={styles.footnote}>
          Full Disk Access is a fallback, not the fix — an unsandboxed build does
          not need it. DriveSweep never deletes anything; it shows the commands
          it would run so you can inspect them first.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: { maxWidth: 520 },
  title: { color: color.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  body: { color: color.textMuted, fontSize: 13, lineHeight: 20, marginTop: 12 },
  mono: { fontFamily: 'Menlo', fontSize: 12, color: color.text },
  em: { color: '#E0B577', fontWeight: '600' },

  code: {
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 5,
    padding: 10,
    marginTop: 12,
  },
  codeText: { color: '#9FD3B0', fontSize: 11, fontFamily: 'Menlo', lineHeight: 18 },

  buttons: { flexDirection: 'row', gap: 10, marginTop: 22 },
  primary: {
    backgroundColor: color.accent,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 6,
    cursor: 'pointer',
  },
  primaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  secondary: {
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 6,
    cursor: 'pointer',
  },
  secondaryText: { color: color.textMuted, fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.75 },

  footnote: { color: color.textFaint, fontSize: 11, lineHeight: 16, marginTop: 20 },
})
