/**
 * Squarified treemap layout.
 *
 * Bruls, Huizing & van Wijk (2000), "Squarified Treemaps". Lays items out so
 * cells stay close to square, which keeps small cells clickable and areas
 * visually comparable — a naive slice-and-dice treemap degenerates into
 * unreadable slivers exactly where DriveSweep has its long tail.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface TreemapInput<T> {
  datum: T
  /** Must be >= 0. Zero and negative values are dropped. */
  value: number
}

export interface TreemapCell<T> extends Rect {
  datum: T
  value: number
}

interface Scaled<T> extends TreemapInput<T> {
  area: number
}

/**
 * Worst (largest) aspect ratio in a row, given the row's total area and the
 * length of the side it is laid out along. Lower is better; 1 is a perfect
 * square.
 */
function worstRatio<T>(row: Scaled<T>[], rowArea: number, side: number): number {
  if (rowArea <= 0 || side <= 0) return Infinity
  const thickness = rowArea / side
  if (thickness <= 0) return Infinity

  let worst = 1
  for (const cell of row) {
    const length = cell.area / thickness
    if (length <= 0) return Infinity
    worst = Math.max(worst, length / thickness, thickness / length)
  }
  return worst
}

/**
 * Lay `input` out inside `bounds`, area proportional to `value`.
 *
 * Cells are returned largest-first, so painting them in order puts the biggest
 * item top-left — which is where people look first.
 */
export function squarify<T>(
  input: TreemapInput<T>[],
  bounds: Rect,
): TreemapCell<T>[] {
  const items = input
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)

  const area = bounds.w * bounds.h
  if (items.length === 0 || area <= 0) return []

  const total = items.reduce((sum, i) => sum + i.value, 0)
  const scale = area / total
  const scaled: Scaled<T>[] = items.map((i) => ({ ...i, area: i.value * scale }))

  const cells: TreemapCell<T>[] = []
  let rect: Rect = { ...bounds }
  let i = 0

  while (i < scaled.length) {
    // Rows always run along the shorter side — that is what keeps cells square.
    const side = Math.min(rect.w, rect.h)
    if (side <= 0) break

    // Grow the row while doing so improves its worst aspect ratio.
    const row: Scaled<T>[] = [scaled[i]]
    let rowArea = scaled[i].area
    let j = i + 1

    while (j < scaled.length) {
      const candidateArea = rowArea + scaled[j].area
      const current = worstRatio(row, rowArea, side)
      const candidate = worstRatio([...row, scaled[j]], candidateArea, side)
      if (candidate > current) break
      row.push(scaled[j])
      rowArea = candidateArea
      j += 1
    }

    // Place the row, then shrink the remaining rectangle by its thickness.
    const thickness = rowArea / side
    const horizontal = rect.w < rect.h
    let offset = 0

    for (const cell of row) {
      const length = cell.area / thickness
      cells.push(
        horizontal
          ? {
              datum: cell.datum,
              value: cell.value,
              x: rect.x + offset,
              y: rect.y,
              w: length,
              h: thickness,
            }
          : {
              datum: cell.datum,
              value: cell.value,
              x: rect.x,
              y: rect.y + offset,
              w: thickness,
              h: length,
            },
      )
      offset += length
    }

    if (horizontal) {
      rect = { x: rect.x, y: rect.y + thickness, w: rect.w, h: rect.h - thickness }
    } else {
      rect = { x: rect.x + thickness, y: rect.y, w: rect.w - thickness, h: rect.h }
    }

    i = j
  }

  return cells
}
