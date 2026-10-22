// Мини-окно над треем: цифра, график, режим, пинг, три кнопки.
import type { TunnelState } from '../../shared/types'
import { AnimatedNumber } from './components/AnimatedNumber'
import { SpeedChart } from './components/SpeedChart'
import { StatusPill } from './components/StatusPill'
import { Tile } from './components/Tile'
import { STATE_LABEL, dn, useLive } from './lib'

const NEXT: Record<TunnelState, TunnelState> = { list: 'full', full: 'off', off: 'list' }

export function Mini(): React.JSX.Element {
  const { status, connection, rates, history, ping } = useLive()
  const busy = connection !== 'online'
  return (
    <div className="mini">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <StatusPill status={status} connection={connection} />
        <span className="close" title="Закрыть" onClick={() => void dn().closeMini()}>✕</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div className="big" style={{ fontSize: 44 }}><AnimatedNumber value={rates?.down ?? 0} /></div>
        <div className="muted small">
          Мбит/с ↓<br />
          <span className="up">↑ <AnimatedNumber value={rates?.up ?? 0} /></span>
        </div>
      </div>
      <SpeedChart points={history} height={40} />
      <div className="row">
        <Tile label="Режим">{status ? STATE_LABEL[status.state] : '—'}</Tile>
        <Tile label="Пинг">{ping === null ? '—' : ping < 0 ? 'нет ответа' : `${ping} мс`}</Tile>
      </div>
      <div className="row">
        <button disabled={busy || !status} onClick={() => status && void dn().setState(NEXT[status.state])}>
          Режим ⇄
        </button>
        <button disabled={busy} onClick={() => void dn().restart()}>Перезапуск</button>
        <button disabled={busy} onClick={() => void dn().setState('off')}>Выключить</button>
      </div>
    </div>
  )
}
