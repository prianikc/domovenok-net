// Значок в трее: цвет по состоянию, клики, меню правой кнопки.
import { Menu, Tray, nativeImage } from 'electron'
import green from '../../resources/tray/green.png?asset'
import yellow from '../../resources/tray/yellow.png?asset'
import red from '../../resources/tray/red.png?asset'
import grey from '../../resources/tray/grey.png?asset'
import type { Hub } from './hub'
import { ClickRouter, iconFor, tooltipFor, type IconColor } from './tray-logic'
import type { Windows } from './windows'

const ICONS: Record<IconColor, string> = { green, yellow, red, grey }

export function createTray(hub: Hub, windows: Windows, quit: () => void): Tray {
  const tray = new Tray(nativeImage.createFromPath(grey))
  const refresh = (): void => {
    tray.setImage(nativeImage.createFromPath(ICONS[iconFor(hub.connection, hub.lastStatus)]))
    tray.setToolTip(tooltipFor(hub.connection, hub.lastStatus))
  }
  hub.on('status', refresh)
  hub.on('connection', refresh)
  refresh()

  const clicks = new ClickRouter(
    () => windows.toggleMini(tray.getBounds()),
    () => windows.openMain()
  )
  tray.on('click', () => clicks.click())
  tray.on('double-click', () => clicks.doubleClick())

  const act = (fn: Parameters<Hub['run']>[0]) => () => void hub.run(fn).catch(() => {})
  tray.on('right-click', () =>
    tray.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: 'Открыть', click: () => windows.openMain() },
        { type: 'separator' },
        { label: 'Перезапустить туннель', click: act((api) => api.restart()) },
        { label: 'Выключить туннель', click: act((api) => api.setState('off')) },
        { type: 'separator' },
        { label: 'Закрыть программу', click: quit }
      ])
    )
  )
  return tray
}
