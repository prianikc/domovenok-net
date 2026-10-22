// «Обзор»: статус, крупное табло скорости, график за минуту, плитки, переключатель режима.
import { useState } from 'react'
import type { TunnelState } from '../../../shared/types'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { SpeedChart } from '../components/SpeedChart'
import { StateSwitch } from '../components/StateSwitch'
import { StatusPill } from '../components/StatusPill'
import { Tile } from '../components/Tile'
import { STATE_LABEL, call, dn, fmt, type Live } from '../lib'

export function Overview({ live, onCheck }: { live: Live; onCheck: () => void }): React.JSX.Element {
  const { status, connection, rates, history, ping } = live
  const [error, setError] = useState('')
  const setState = (s: TunnelState): void => {
    setError('')
    call(dn().setState(s)).catch((e: Error) => setError(e.message))
  }
  return (
    <div className="center">
      <StatusPill status={status} connection={connection} />
      <div className="big" style={{ fontSize: 88, marginTop: 12 }}>
        <AnimatedNumber value={rates?.down ?? 0} />
      </div>
      <div className="muted" style={{ fontSize: 15 }}>Мбит/с загрузка</div>
      <div className="up" style={{ fontSize: 20, marginTop: 4 }}>
        ↑ {fmt(rates?.up)} <span className="muted" style={{ fontSize: 13 }}>Мбит/с отдача</span>
      </div>
      <div style={{ width: '90%', marginTop: 10 }}>
        <SpeedChart points={history} height={90} />
      </div>
      <div className="legend">
        <span><span className="sw" style={{ background: 'var(--vpn)' }} />через VPN</span>
        <span><span className="sw" style={{ background: 'var(--direct)' }} />напрямую</span>
        <span>последние 60 с</span>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <Tile label="Режим">{status ? STATE_LABEL[status.state] : '—'}</Tile>
        <Tile label="Через VPN"><span className="ok-c">{fmt(rates?.vpnDown)} Мбит/с</span></Tile>
        <Tile label="Напрямую"><span className="dn-c">{fmt(rates?.directDown)} Мбит/с</span></Tile>
        <Tile label="Пинг до сервера">{ping === null ? '—' : ping < 0 ? 'нет ответа' : `${ping} мс`}</Tile>
      </div>
      <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
        <StateSwitch value={status?.state} onChange={setState} disabled={connection !== 'online'} />
        <button onClick={onCheck}>Проверить</button>
      </div>
      {error && <div className="err">{error}</div>}
    </div>
  )
}
