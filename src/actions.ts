/**
 * Reclaim actions — ALL PLACEHOLDERS.
 *
 * Nothing here deletes anything. Every function is the marked site where a real
 * implementation would go, so the UI can be built and the flow exercised end to
 * end without risk.
 *
 * Before any of these becomes real, the preconditions in each `guards` array
 * must be implemented — they are the difference between a disk cleaner and a
 * footgun. See docs/DISCOVERY.md §3.
 */

import type { CatalogEntry } from './catalog'

export interface PlanStep {
  entryId: string
  /** What would happen, in the user's words. */
  description: string
  /** Bytes expected back. Not guaranteed — hardlinks may free less. */
  estimatedBytes: number
  /** Must all pass before execution. Unimplemented. */
  guards: string[]
}

export interface Plan {
  steps: PlanStep[]
  totalEstimatedBytes: number
}

/** Guards that apply to every deletion, regardless of entry. */
const UNIVERSAL_GUARDS = [
  'Full Disk Access granted (probe a known-nonempty path — TCC fails silently)',
  'Path resolves inside an allowed root and is not in NEVER_TOUCH',
  'Path is not a symlink (never follow out of the allowed root)',
  'User has confirmed this specific entry',
]

/** Extra guards implied by an entry's own semantics. */
function guardsFor(entry: CatalogEntry): string[] {
  const guards = [...UNIVERSAL_GUARDS]

  if (entry.tool === 'CoreSimulator') {
    guards.push('No targeted simulator is in Booted state (xcrun simctl list devices -j)')
  }
  if (entry.tier === 'caution') {
    guards.push(`User acknowledged what is lost: ${entry.youLose ?? 'state'}`)
  }
  if (entry.reclaim.via === 'command') {
    guards.push(`Owning tool is installed and on PATH for: ${entry.reclaim.command}`)
  }
  if (entry.id === 'node-modules') {
    guards.push('A lockfile exists next to each node_modules and parses')
  }
  if (entry.id === 'android-ndk') {
    guards.push('No project build.gradle / gradle.properties pins the target version')
  }
  return guards
}

/**
 * Build a plan describing what WOULD be reclaimed. Pure — touches no disk.
 * This is the only function here that is fully implemented, because previewing
 * is the whole product right now.
 */
export function buildPlan(entries: CatalogEntry[], selectedIds: string[]): Plan {
  const selected = entries.filter((e) => selectedIds.includes(e.id))

  const steps = selected.map((entry): PlanStep => ({
    entryId: entry.id,
    description:
      entry.reclaim.via === 'command'
        ? `Run \`${entry.reclaim.command}\` (${entry.label})`
        : entry.reclaim.via === 'manual'
          ? `Review manually — ${entry.label} is not safe to remove automatically`
          : `Delete ${entry.path} (${entry.label})`,
    estimatedBytes: (entry.measuredGiB ?? 0) * 1024 ** 3,
    guards: guardsFor(entry),
  }))

  return {
    steps,
    totalEstimatedBytes: steps.reduce((sum, s) => sum + s.estimatedBytes, 0),
  }
}

// ---------------------------------------------------------------------------
// PLACEHOLDERS — where deletion would happen. None of these are wired up.
// ---------------------------------------------------------------------------

/**
 * PLACEHOLDER. Would unlink a directory tree.
 *
 * Real implementation belongs in the native Swift module (docs/PLATFORM.md §3),
 * not in JS: it needs the same inode de-duplication as the scanner so progress
 * reporting isn't nonsense, and it must be cancellable.
 *
 * Note NSFileManager.trashItem does NOT reclaim space (DISCOVERY.md §3.9) — if
 * we offer Trash as the safe default, the UI must say so plainly.
 */
export async function deleteTree(_step: PlanStep): Promise<never> {
  throw new Error(
    'Not implemented: deleteTree is a placeholder. DriveSweep is preview-only.',
  )
}

/**
 * PLACEHOLDER. Would shell out to an owning tool (simctl, brew, docker, pnpm).
 *
 * Requires an unsandboxed app to use Process at all (docs/PLATFORM.md §2).
 * Must never interpolate user input into the command string.
 */
export async function runReclaimCommand(_step: PlanStep): Promise<never> {
  throw new Error(
    'Not implemented: runReclaimCommand is a placeholder. DriveSweep is preview-only.',
  )
}

/**
 * PLACEHOLDER. Would verify each guard in `step.guards` before execution.
 *
 * Until this is real, nothing above may be called. Returning `false` is the
 * correct, safe answer for now — not a stub to be optimistically flipped.
 */
export async function checkGuards(_step: PlanStep): Promise<boolean> {
  return false
}
