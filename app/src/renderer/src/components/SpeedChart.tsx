// График скорости за последние 60 с: две открытые линии, без заливки.
export interface ChartPoint {
  vpn: number
  direct: number
}

const W = 400

function line(values: number[], max: number, height: number): string {
  if (values.length === 0) return ''
  const step = values.length > 1 ? W / (values.length - 1) : 0
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`)
    .join(' ')
}

export function SpeedChart({ points, height }: { points: ChartPoint[]; height: number }): React.JSX.Element {
  const max = Math.max(1, ...points.map((p) => Math.max(p.vpn, p.direct)))
  return (
    <svg className="chart" width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
      <path d={line(points.map((p) => p.vpn), max, height)} fill="none" stroke="#6cc58a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <path d={line(points.map((p) => p.direct), max, height)} fill="none" stroke="#58a6ff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
