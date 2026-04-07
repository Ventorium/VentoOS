/**
 * SVG chart utilities — shared helpers for the lightweight chart library.
 */

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Compute nice axis bounds.
 * Returns [min, max] where min ≥ 0 and max has some headroom.
 */
export function niceScale(dataMin: number, dataMax: number): [number, number] {
  const min = Math.min(dataMin, 0)
  if (dataMax === min) return [min, min + 1]
  const range = dataMax - min
  const headroom = range * 0.1
  return [min, dataMax + headroom]
}

/**
 * Generate a smooth cubic-bezier path through points using Catmull-Rom → Bezier conversion.
 * Returns an SVG `d` attribute string.
 */
export function smoothPath(points: [number, number][], tension = 0.3): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`
  if (points.length === 2) {
    return `M${points[0][0]},${points[0][1]}L${points[1][0]},${points[1][1]}`
  }

  let d = `M${points[0][0]},${points[0][1]}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]

    const cp1x = p1[0] + ((p2[0] - p0[0]) * tension) / 3
    const cp1y = p1[1] + ((p2[1] - p0[1]) * tension) / 3
    const cp2x = p2[0] - ((p3[0] - p1[0]) * tension) / 3
    const cp2y = p2[1] - ((p3[1] - p1[1]) * tension) / 3

    d += `C${cp1x},${cp1y},${cp2x},${cp2y},${p2[0]},${p2[1]}`
  }

  return d
}

/** Default number formatter */
export function defaultFormat(v: number): string {
  if (Number.isInteger(v)) return v.toString()
  return v.toFixed(1)
}
