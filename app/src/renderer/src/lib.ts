// Обёртки над window.domovenok: распаковка Result и живые данные.
import { useEffect, useState } from 'react'
import type { Result } from '../../shared/ipc'
import type { Rates } from '../../shared/speed'
import type { Connection, Status, TunnelState } from '../../shared/types'
import type { ChartPoint } from './components/SpeedChart'

export const dn = (): Window['domovenok'] => window.domovenok

export async function call<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p
  if (!r.ok) throw new Error(r.error)
  return r.data
}

export const STATE_LABEL: Record<TunnelState, string> = {
  off: 'Выключен',
  list: 'Только список',
  full: 'Всё через VPN'
}

export interface Live {
  status: Status | null
  connection: Connection
  rates: Rates | null
  history: ChartPoint[]
  ping: number | null
}

export function useLive(): Live {
  const [status, setStatus] = useState<Status | null>(null)
  const [connection, setConnection] = useState<Connection>('offline')
  const [rates, setRates] = useState<Rates | null>(null)
  const [history, setHistory] = useState<ChartPoint[]>([])
  const [ping, setPing] = useState<number | null>(null)
  useEffect(() => {
    void dn().getStatus().then((r) => r.ok && setStatus(r.data))
    void dn().getConnection().then((r) => r.ok && setConnection(r.data))
    const offs = [
      dn().onStatus(setStatus),
      dn().onConnection(setConnection),
      dn().onPing(setPing),
      dn().onRates((r) => {
        setRates(r)
        setHistory((h) => [...h.slice(-59), { vpn: r.vpnDown, direct: r.directDown }])
      })
    ]
    return () => offs.forEach((off) => off())
  }, [])
  return { status, connection, rates, history, ping }
}

export function fmt(n: number | undefined): string {
  return (n ?? 0).toFixed(1)
}
