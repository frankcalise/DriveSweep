import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  addRootCompleteListener,
  cancelScan,
  checkPaths,
  isDiskScannerSupported,
  matchDirs,
  scanRoots,
  type ScanRootEvent,
} from '@drivesweep/disk-scanner'

import { CATALOG, topLevelEntries, type CatalogEntry } from './catalog'
import { readSimRuntimes } from './toolProbe'

/** What the live scan found for one catalog entry. */
export interface EntryMeasurement {
  bytes: number
  present: boolean
  files: number
  dedupedInodes: number
  unreadable: number
  elapsedMs: number
}

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'cancelled'

/**
 * Representative protected roots. If none of these can be enumerated the app
 * has no useful access; if some can, the scan proceeds and reports per-entry
 * `unreadable` counts.
 */
const ACCESS_PROBES: readonly string[] = [
  // Always present on macOS, so "no probe exists" means something is wrong
  // rather than a bare machine.
  '~/Library',
  '~/Library/Caches',
  // Absolute and outside any sandbox container: a sandboxed build cannot read
  // this even though it can read its own container's Library.
  '/Library/Developer',
]

/**
 * Whether the representative roots can actually be read.
 *
 * Deliberately conservative: unverifiable means false. Showing sizes we cannot
 * confirm is the failure this gate exists to prevent, and a directory withheld
 * by macOS opens successfully and reads back *empty* — so entry counts, not
 * open success, are the signal.
 */
function probeAccess(): boolean {
  const checks = checkPaths(ACCESS_PROBES)
  if (checks.length === 0) return false
  const existing = checks.filter((c) => c.exists)
  if (existing.length === 0) return false
  return existing.some((c) => c.readable && c.entries > 0)
}

export interface ScanState {
  status: ScanStatus
  /** False means nothing readable — gate the UI on this. */
  hasAccess: boolean
  supported: boolean
  measurements: Record<string, EntryMeasurement>
  scannedAt: Date | null
  elapsedMs: number
  done: number
  total: number
}

/**
 * Entries the walker can measure directly.
 *
 * Glob paths (`~/code/**​/node_modules`) need expansion the native side does
 * not do yet. Cryptex simulator runtimes are excluded too — they are
 * `nobrowse` APFS volumes that `fts` cannot see at all, and only `simctl` can
 * report them. Both fall back to the recorded snapshot rather than silently
 * reading as zero.
 */
export function isDirectlyScannable(entry: CatalogEntry): boolean {
  if (entry.path.includes('*')) return false
  if (entry.path.includes('/Cryptex/')) return false
  return true
}

/** Glob entries measured by directory-name matching instead of a plain walk. */
export function isMatchable(entry: CatalogEntry): boolean {
  return entry.match !== undefined
}

const BYTES_PER_GIB = 1024 ** 3

export function useScan() {
  const entries = useMemo(() => topLevelEntries(CATALOG), [])
  const scannable = useMemo(() => entries.filter(isDirectlyScannable), [entries])

  const [state, setState] = useState<ScanState>(() => ({
    status: 'idle',
    hasAccess: isDiskScannerSupported ? probeAccess() : false,
    supported: isDiskScannerSupported,
    measurements: {},
    scannedAt: null,
    elapsedMs: 0,
    done: 0,
    total: 0,
  }))

  const running = useRef(false)

  // Re-check access on focus-ish intervals: the user may grant it in System
  // Settings while the app is open, and nothing notifies us when they do.
  useEffect(() => {
    if (!isDiskScannerSupported) return
    const id = setInterval(() => {
      const granted = probeAccess()
      setState((prev) => (prev.hasAccess === granted ? prev : { ...prev, hasAccess: granted }))
    }, 2000)
    return () => clearInterval(id)
  }, [])

  const start = useCallback(async () => {
    if (running.current || !isDiskScannerSupported) return
    running.current = true

    // The native side expands `~` itself, so pass catalog paths through as-is.
    const paths = scannable.map((e) => e.path)
    const matchable = entries.filter(isMatchable)
    // Walk roots + glob matches + the simctl probe, so progress is honest.
    const total = paths.length + matchable.length + 1
    setState((prev) => ({
      ...prev,
      status: 'scanning',
      done: 0,
      total,
      measurements: {},
    }))

    // Fill the UI as each root lands rather than waiting for the whole walk.
    const subscription = addRootCompleteListener((event: ScanRootEvent) => {
      // Attribute by index, not by path: the scanner reports the *expanded*
      // path, and Hermes has no process.env.HOME to expand `~` against.
      const id = scannable[event.index]?.id
      if (!id) return
      setState((prev) => ({
        ...prev,
        done: event.index + 1,
        measurements: {
          ...prev.measurements,
          [id]: {
            bytes: event.bytes,
            present: event.present,
            files: event.files,
            dedupedInodes: event.dedupedInodes,
            unreadable: event.unreadable,
            elapsedMs: event.elapsedMs,
          },
        },
      }))
    })

    // Glob entries can't be expressed as a walk root, so they are matched by
    // directory name afterwards. Sequential on purpose: these traverse ~/code,
    // and running them alongside the main scan just thrashes the disk.
    try {
      const result = await scanRoots(paths)

      // Cancel has to stop here too. The phases below traverse ~/code and
      // shell out to simctl, so continuing after a cancel keeps the disk busy
      // for minutes while the button still reads "Cancel".
      if (result.cancelled) {
        setState((prev) => ({ ...prev, status: 'cancelled', elapsedMs: result.elapsedMs }))
        return
      }

      // Simulator runtimes are invisible to any walk (nobrowse APFS volumes),
      // so simctl is the only source.
      const simRuntimes = await readSimRuntimes()
      // Counted whether or not it produced anything: xcrun may be missing or
      // no runtimes installed, and progress must still reach 100%.
      setState((prev) => ({ ...prev, done: prev.done + 1 }))
      if (simRuntimes.available && simRuntimes.runtimes.length > 0) {
        setState((prev) => ({
          ...prev,
          measurements: {
            ...prev.measurements,
            'sim-runtimes': {
              bytes: simRuntimes.totalBytes,
              present: true,
              files: simRuntimes.runtimes.length,
              dedupedInodes: 0,
              unreadable: 0,
              elapsedMs: 0,
            },
          },
        }))
      }

      for (const entry of matchable) {
        if (!entry.match) continue
        const matched = await matchDirs(entry.match)
        setState((prev) => ({
          ...prev,
          done: prev.done + 1,
          measurements: {
            ...prev.measurements,
            [entry.id]: {
              bytes: matched.bytes,
              present: matched.present && matched.matches > 0,
              files: matched.files,
              dedupedInodes: matched.dedupedInodes,
              unreadable: matched.unreadable,
              elapsedMs: matched.elapsedMs,
            },
          },
        }))
      }

      setState((prev) => ({
        ...prev,
        status: result.cancelled ? 'cancelled' : 'done',
        scannedAt: new Date(),
        elapsedMs: result.elapsedMs,
      }))
    } finally {
      subscription.remove()
      running.current = false
    }
  }, [scannable, entries])

  const cancel = useCallback(() => cancelScan(), [])

  /**
   * Re-probe access only. The gate's button must not kick off a multi-minute
   * walk: doing so recorded zeros for every entry while still gated, left
   * `status` at 'done', and so blocked the auto-start that would otherwise
   * have measured properly once access appeared.
   */
  const recheck = useCallback(() => {
    const granted = probeAccess()
    setState((prev) => (prev.hasAccess === granted ? prev : { ...prev, hasAccess: granted }))
  }, [])

  /**
   * Live GiB for an entry, or the recorded snapshot when it has not been
   * measured on this machine. Never silently substitutes one for the other —
   * `isLive` says which it is.
   */
  const sizeFor = useCallback(
    (entry: CatalogEntry): { gib: number; isLive: boolean; present: boolean } => {
      const measured = state.measurements[entry.id]
      if (measured) {
        return { gib: measured.bytes / BYTES_PER_GIB, isLive: true, present: measured.present }
      }
      return { gib: entry.measuredGiB ?? 0, isLive: false, present: true }
    },
    [state.measurements],
  )

  return { ...state, start, cancel, recheck, sizeFor, scannableCount: scannable.length }
}


