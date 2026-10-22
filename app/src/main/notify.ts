// Уведомления Windows о потере и возврате связи с сервером VPN.
import { Notification } from 'electron'
import { APP_NAME } from '../shared/config'
import type { Hub } from './hub'

export function wireNotifications(hub: Hub, openRouterTab: () => void): void {
  hub.on('health-lost', () => {
    const n = new Notification({
      title: 'VPN не отвечает',
      body: `Нет связи с сервером VPN. Откройте «${APP_NAME}» и нажмите «Проверить».`
    })
    n.on('click', openRouterTab)
    n.show()
  })
  hub.on('health-restored', () => {
    new Notification({ title: 'VPN снова работает', body: 'Связь с сервером VPN восстановлена.' }).show()
  })
}
