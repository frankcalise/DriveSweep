import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  addRootCompleteListener,
  cancelScan,
  hasFullDiskAccess,
  isDiskScannerSupported,
  scanRoots,
  type ScanRootEvent,
} from '@drivesweep/disk-scanner'

import { CATALOG, topLevelEntries, type CatalogEntry } from './catalog'

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

export interface ScanState {
  status: ScanStatus
  /** False means every number would be wrong — gate the UI on this. */
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

const BYTES_PER_GIB = 1024 ** 3

export function useScan() {
  const entries = useMemo(() => topLevelEntries(CATALOG), [])
  const scannable = useMemo(() => entries.filter(isDirectlyScannable), [entries])

  const [state, setState] = useState<ScanState>(() => ({
    status: 'idle',
    hasAccess: isDiskScannerSupported ? hasFullDiskAccess() : false,
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
      const granted = hasFullDiskAccess()
      setState((prev) => (prev.hasAccess === granted ? prev : { ...prev, hasAccess: granted }))
    }, 2000)
    return () => clearInterval(id)
  }, [])

  const start = useCallback(async () => {
    if (running.current || !isDiskScannerSupported) return
    running.current = true

    // The native side expands `~` itself, so pass catalog paths through as-is.
    const paths = scannable.map((e) => e.path)
    setState((prev) => ({
      ...prev,
      status: 'scanning',
      done: 0,
      total: paths.length,
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

    try {
      const result = await scanRoots(paths)
      setState((prev) => ({
        ...prev,
        status: result.cancelled ? 'cancelled' : 'done',
        hasAccess: result.hasFullDiskAccess,
        scannedAt: new Date(),
        elapsedMs: result.elapsedMs,
      }))
    } finally {
      subscription.remove()
      running.current = false
    }
  }, [scannable])

  const cancel = useCallback(() => cancelScan(), [])

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

  return { ...state, start, cancel, sizeFor, scannableCount: scannable.length }
}


