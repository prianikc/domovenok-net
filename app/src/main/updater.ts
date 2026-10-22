// Обновления из GitHub Releases: проверка при запуске и раз в 6 часов, установка при выходе.
import { Notification, app } from 'electron'
import electronUpdater from 'electron-updater'

const SIX_HOURS = 6 * 60 * 60 * 1000

export function startUpdater(): void {
  if (!app.isPackaged) return
  const { autoUpdater } = electronUpdater
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', (info) => {
    new Notification({
      title: 'Доступна новая версия',
      body: `ДомовёнокNET ${info.version} установится, когда вы закроете программу.`
    }).show()
  })
  const check = (): void => void autoUpdater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, SIX_HOURS)
}
