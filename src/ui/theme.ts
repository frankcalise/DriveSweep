import type { Tier } from '../catalog'

export const color = {
  bg: '#0F1115',
  panel: '#161A21',
  panelRaised: '#1D222B',
  border: '#282E38',
  text: '#E7EAF0',
  textMuted: '#98A1AF',
  textFaint: '#6B7482',
  /** macOS system blue — marks the splitter while hovered or dragging. */
  accent: '#0A84FF',
} as const

/**
 * Tier colours double as the treemap legend, so they must stay distinguishable
 * at small cell sizes. Hues are ordered green → blue → amber → red to read as
 * increasing risk.
 */
export const tierColor: Record<Tier, string> = {
  safe: '#3FA96B',
  redownload: '#4A90D9',
  caution: '#D99A3C',
  keep: '#C4635C',
}

export const tierLabel: Record<Tier, string> = {
  safe: 'Safe',
  redownload: 'Re-download',
  caution: 'Caution',
  keep: 'Keep',
}

export const tierBlurb: Record<Tier, string> = {
  safe: 'Regenerates locally in seconds',
  redownload: 'Regenerates, but over the network',
  caution: 'Regenerates, but you lose state',
  keep: 'Not safely removed by deleting files',
}

export function formatGiB(gib: number): string {
  if (gib >= 100) return `${gib.toFixed(0)} GiB`
  if (gib >= 10) return `${gib.toFixed(1)} GiB`
  if (gib >= 1) return `${gib.toFixed(2)} GiB`
  return `${(gib * 1024).toFixed(0)} MiB`
}

/** `~` for the home directory, so paths stay readable in narrow panels. */
export function shortPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~')
}
