// Запуск вместе с Windows (свёрнутым в трей).
import { app } from 'electron'

export function getAutostart(): boolean {
  return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin
}

export function setAutostart(on: boolean): void {
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] })
}
