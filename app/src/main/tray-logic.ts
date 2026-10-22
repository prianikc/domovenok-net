// Значок в трее: цвет, подсказка и разбор одиночного/двойного клика.
import { APP_NAME } from '../shared/config'
import type { Connection, Status } from '../shared/types'

export type IconColor = 'green' | 'yellow' | 'red' | 'grey'

export function iconFor(conn: Connection, s: Status | null): IconColor {
  if (conn === 'offline') return 'grey'
  if (conn === 'busy') return 'yellow'
  if (!s) return 'grey'
  if (s.state === 'off' || !s.healthy) return 'red'
  return 'green'
}

export function tooltipFor(conn: Connection, s: Status | null): string {
  if (conn === 'offline' || !s) return `${APP_NAME} — роутер не отвечает`
  if (s.state === 'off') return `${APP_NAME} — VPN выключен`
  if (!s.healthy) return `${APP_NAME} — VPN не отвечает`
  return `${APP_NAME} — VPN работает · ${s.profile}`
}

/** Windows сначала шлёт click, потом double-click: одиночный срабатывает только после паузы (500 мс — время двойного клика в Windows по умолчанию). */
export class ClickRouter {
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    private onSingle: () => void,
    private onDouble: () => void,
    private delayMs = 500
  ) {}

  click(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(this.onSingle, this.delayMs)
  }

  doubleClick(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.onDouble()
  }
}
