import type { Connection, Status } from '../../../shared/types'

export function StatusPill({ status, connection }: { status: Status | null; connection: Connection }): React.JSX.Element {
  if (connection === 'offline' || !status) return <span className="pill grey">● Роутер не отвечает</span>
  if (status.state === 'off') return <span className="pill bad">● VPN выключен</span>
  if (!status.healthy) return <span className="pill bad">● VPN не отвечает</span>
  return <span className="pill ok">● Защищено · {status.profile}</span>
}
