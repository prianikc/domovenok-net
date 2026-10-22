// График скорости за последние 60 с: две открытые сглаженные линии без заливки.
// Новая точка приходит раз в секунду; чтобы график не прыгал, он за эту секунду плавно
// съезжает влево на один шаг, а масштаб растёт сразу и уменьшается постепенно.
import { useLayoutEffect, useRef } from 'react'

export interface ChartPoint {
  vpn: number
  direct: number
}

const W = 400
const SLOTS = 60
const STEP = W / (SLOTS - 1)

/** Кривая через точки (Catmull-Rom -> кубические Безье) без выбросов за соседние значения. */
export function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return ''
  const f = (n: number): string => String(Math.round(n * 10) / 10)
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)]
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 2)]
    const lo = Math.min(y1, y2)
    const hi = Math.max(y1, y2)
    const clamp = (y: number): number => Math.min(hi, Math.max(lo, y))
    const c1 = [x1 + (x2 - x0) / 6, clamp(y1 + (y2 - y0) / 6)]
    const c2 = [x2 - (x3 - x1) / 6, clamp(y2 - (y3 - y1) / 6)]
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(x2)} ${f(y2)}`
  }
  return d
}

export function SpeedChart({ points, height }: { points: ChartPoint[]; height: number }): React.JSX.Element {
  const group = useRef<SVGGElement>(null)
  const scale = useRef(1)

  const peak = Math.max(1, ...points.map((p) => Math.max(p.vpn, p.direct))) * 1.1
  scale.current = peak >= scale.current ? peak : scale.current * 0.9 + peak * 0.1
  const max = scale.current

  // самая новая точка — у правого края; при каждой новой точке весь график съезжает на шаг за секунду
  const offset = (SLOTS - points.length) * STEP
  const line = (pick: (p: ChartPoint) => number): string =>
    smoothPath(points.map((p, i) => [offset + i * STEP, height - 2 - (pick(p) / max) * (height - 4)]))

  useLayoutEffect(() => {
    const g = group.current
    if (!g || points.length < 2) return
    g.style.transition = 'none'
    g.style.transform = `translateX(${STEP}px)`
    void g.getBoundingClientRect()
    g.style.transition = 'transform 1s linear'
    g.style.transform = 'translateX(0px)'
  }, [points])

  return (
    <svg className="chart" width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
      <g ref={group}>
        <path d={line((p) => p.vpn)} fill="none" stroke="#6cc58a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <path d={line((p) => p.direct)} fill="none" stroke="#58a6ff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  )
}
