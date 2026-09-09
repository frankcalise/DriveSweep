/**
 * Measurements that are not filesystem problems.
 *
 * Some of the largest reclaimable items on a developer Mac cannot be measured
 * by walking paths at all. Simulator runtimes are the clearest case: they live
 * on read-only APFS volumes mounted `nobrowse` under
 * `/Library/Developer/CoreSimulator/Cryptex/`, which `fts` with `FTS_XDEV`
 * cannot see — `du -x` reports them as 0. Only `simctl` knows their size.
 *
 * Everything here is READ-ONLY. DriveSweep does not run reclaim commands; it
 * prints them for inspection. See docs/ARCHITECTURE.md section 3.
 */

import { commandRunner } from '@drivesweep/command-runner'

const XCRUN = '/usr/bin/xcrun'

export interface SimRuntime {
  identifier: string
  /** e.g. "iOS 18.2" */
  name: string
  bytes: number
  /** simctl's own view of whether it can be removed. */
  deletable: boolean
  /** ISO timestamp, or null. The best staleness signal we have. */
  lastUsedAt: string | null
  state: string
}

export interface SimRuntimesResult {
  available: boolean
  runtimes: SimRuntime[]
  totalBytes: number
  error?: string
}

/** Shape of one entry in `xcrun simctl runtime list -j`. */
interface RawRuntime {
  identifier?: string
  version?: string
  build?: string
  platformIdentifier?: string
  sizeBytes?: number
  deletable?: boolean
  lastUsedAt?: string
  state?: string
}

function platformLabel(platformIdentifier: string | undefined): string {
  if (!platformIdentifier) return 'Runtime'
  if (platformIdentifier.includes('iphone')) return 'iOS'
  if (platformIdentifier.includes('appletv')) return 'tvOS'
  if (platformIdentifier.includes('watch')) return 'watchOS'
  if (platformIdentifier.includes('xr')) return 'visionOS'
  return 'Runtime'
}

/**
 * Total the installed simulator runtimes.
 *
 * `xcode-select` may point nowhere, or the command-line tools may be absent, so
 * an unavailable `xcrun` is an expected state rather than an error.
 */
export async function readSimRuntimes(): Promise<SimRuntimesResult> {
  try {
    const availability = await commandRunner.getAvailability([XCRUN])
    if (!availability[XCRUN]) {
      return {
        available: false,
        runtimes: [],
        totalBytes: 0,
        error: 'xcrun not available — Xcode command-line tools not selected.',
      }
    }

    const result = await commandRunner.runCommand({
      command: XCRUN,
      args: ['simctl', 'runtime', 'list', '-j'],
      timeoutMs: 30_000,
    })

    if (result.timedOut) {
      return { available: true, runtimes: [], totalBytes: 0, error: 'simctl timed out.' }
    }
    if (result.exitCode !== 0) {
      return {
        available: true,
        runtimes: [],
        totalBytes: 0,
        error: result.stderr.trim() || `simctl exited ${result.exitCode}`,
      }
    }

    const parsed = JSON.parse(result.stdout) as Record<string, RawRuntime>
    const runtimes: SimRuntime[] = Object.values(parsed).map((raw) => ({
      identifier: raw.identifier ?? '',
      name: `${platformLabel(raw.platformIdentifier)} ${raw.version ?? '?'}${
        raw.build ? ` (${raw.build})` : ''
      }`,
      bytes: raw.sizeBytes ?? 0,
      deletable: raw.deletable ?? false,
      lastUsedAt: raw.lastUsedAt ?? null,
      state: raw.state ?? 'Unknown',
    }))
    runtimes.sort((a, b) => b.bytes - a.bytes)

    return {
      available: true,
      runtimes,
      totalBytes: runtimes.reduce((sum, r) => sum + r.bytes, 0),
    }
  } catch (error) {
    return {
      available: false,
      runtimes: [],
      totalBytes: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

declare const __DEV__: boolean
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  ;(globalThis as unknown as Record<string, unknown>).__driveSweepTools = {
    readSimRuntimes,
  }
}
