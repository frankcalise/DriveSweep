import { View, Text, Pressable, Linking, StyleSheet } from 'react-native'

import { color } from './theme'

const SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'

/**
 * Shown when the app cannot read TCC-protected locations.
 *
 * This screen is not decoration. Without Full Disk Access macOS returns *empty*
 * directory listings rather than errors, so every measurement reads 0 GiB and
 * the app would look like it works on a spotless disk. Full Disk Access also
 * cannot be requested programmatically — only granted by hand — so the only
 * correct behaviour is to say so plainly and link to the right pane.
 */
export function AccessGate({ onRecheck }: { onRecheck: () => void }) {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Can't read your Library</Text>
        <Text style={styles.body}>
          DriveSweep reads <Text style={styles.mono}>~/Library</Text>,{' '}
          <Text style={styles.mono}>/Library/Developer</Text> and other protected
          locations to measure what your tools have cached.
        </Text>
        <Text style={styles.body}>
          None of them read back. macOS returns protected directories as{' '}
          <Text style={styles.em}>empty</Text> rather than refusing, so showing
          numbers now would report zero and look like a clean disk.
        </Text>
        <Text style={styles.body}>
          Normally this means the app is still sandboxed — run{' '}
          <Text style={styles.mono}>scripts/apply-native-patches.sh</Text> and
          rebuild. Granting Full Disk Access also works, though an unsandboxed
          build should not need it.
        </Text>

        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={() => Linking.openURL(SETTINGS_URL)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Open Settings</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            onPress={onRecheck}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Check again</Text>
          </Pressable>
        </View>

        <Text style={styles.footnote}>
          DriveSweep never deletes anything. It shows the commands it would run
          so you can inspect them first.
        </Text>
      </View>
    </View>
  )
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepNum}>{n}</Text>
      <Text style={styles.stepText}>{text}</Text>
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

  steps: { marginTop: 20, gap: 9 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: {
    color: color.textFaint,
    fontSize: 11,
    fontWeight: '700',
    width: 14,
    lineHeight: 18,
  },
  stepText: { color: color.textMuted, fontSize: 12, lineHeight: 18, flex: 1 },

  buttons: { flexDirection: 'row', gap: 10, marginTop: 24 },
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

  footnote: { color: color.textFaint, fontSize: 11, lineHeight: 16, marginTop: 22 },
})
