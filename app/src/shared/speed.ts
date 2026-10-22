// Табло скорости: из двух соседних замеров счётчиков роутера -> Мбит/с.
export interface StatSample {
  t: number
  wanRx: number
  wanTx: number
  wanRxPkts: number
  wanTxPkts: number
  tunRx: number
  tunTx: number
  tunRxPkts: number
  tunTxPkts: number
}

export interface Rates {
  down: number
  up: number
  vpnDown: number
  vpnUp: number
  directDown: number
  directUp: number
}

/** Накладные расходы туннеля на пакет: IPv4 + UDP + заголовок WireGuard/AmneziaWG. */
export const OVERHEAD_BYTES_PER_PACKET = 80

const ZERO: Rates = { down: 0, up: 0, vpnDown: 0, vpnUp: 0, directDown: 0, directUp: 0 }

export function computeRates(prev: StatSample, cur: StatSample): Rates {
  const dt = cur.t - prev.t
  if (dt <= 0) return { ...ZERO }
  const d = (k: keyof StatSample): number => Math.max(0, cur[k] - prev[k])
  const mbps = (bytes: number): number => Math.round((bytes * 8) / dt / 1e5) / 10
  const vpnDown = d('tunRx')
  const vpnUp = d('tunTx')
  const directDown = Math.max(0, d('wanRx') - (vpnDown + d('tunRxPkts') * OVERHEAD_BYTES_PER_PACKET))
  const directUp = Math.max(0, d('wanTx') - (vpnUp + d('tunTxPkts') * OVERHEAD_BYTES_PER_PACKET))
  const r = {
    vpnDown: mbps(vpnDown),
    vpnUp: mbps(vpnUp),
    directDown: mbps(directDown),
    directUp: mbps(directUp)
  }
  return {
    ...r,
    down: Math.round((r.vpnDown + r.directDown) * 10) / 10,
    up: Math.round((r.vpnUp + r.directUp) * 10) / 10
  }
}

export type StatLine = StatSample | { ping: number } | { health: boolean }

export function parseStatLine(line: string): StatLine | null {
  const p = line.trim().split(/\s+/)
  if (p[0] === 'S' && p.length === 10 && p.slice(1).every((x) => /^\d+$/.test(x))) {
    const n = p.slice(1).map(Number)
    return {
      t: n[0], wanRx: n[1], wanTx: n[2], wanRxPkts: n[3], wanTxPkts: n[4],
      tunRx: n[5], tunTx: n[6], tunRxPkts: n[7], tunTxPkts: n[8]
    }
  }
  if (p[0] === 'P' && p.length === 2 && /^-?\d+$/.test(p[1])) return { ping: Number(p[1]) }
  if (p[0] === 'H' && p.length === 2 && /^[01]$/.test(p[1])) return { health: p[1] === '1' }
  return null
}
