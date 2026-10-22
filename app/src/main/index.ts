// ДомовёнокNET: точка входа main-процесса.
import { app, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { join } from 'node:path'
import type { Result } from '../shared/ipc'
import { setAutostart } from './autostart'
import { createContext, type Context } from './context'
import { flowHandlers } from './flows'
import { baseHandlers } from './handlers'
import { wireNotifications } from './notify'
import { createTray } from './tray'
import { startUpdater } from './updater'
import { Windows } from './windows'

app.setPath('userData', join(app.getPath('appData'), 'DomovenokNET'))

if (!app.requestSingleInstanceLock()) app.quit()

let ctx: Context

function wireIpc(handlers: Record<string, (...a: unknown[]) => unknown>): void {
  ipcMain.handle('dn:call', async (_e, method: string, args: unknown[]): Promise<Result<unknown>> => {
    const h = handlers[method]
    if (!h) return { ok: false, error: `Неизвестный вызов: ${method}` }
    try {
      return { ok: true, data: (await h(...args)) ?? null }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('ru.domovenoknet.app')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  const windows = new Windows((visible) => ctx.hub.setVisible(visible))
  ctx = createContext(windows)
  const { hub } = ctx

  if (!ctx.settings.deployedVersion && ctx.settings.autostart) setAutostart(true)

  for (const ev of ['status', 'connection', 'rates', 'ping'] as const) hub.on(ev, (v) => windows.send(ev, v))
  wireNotifications(hub, () => windows.openMain('router'))
  wireIpc({ ...baseHandlers(ctx), ...flowHandlers(ctx) } as Record<string, (...a: unknown[]) => unknown>)

  createTray(hub, windows, () => {
    windows.quitting = true
    hub.stop()
    app.quit()
  })

  startUpdater()

  const paired = !!ctx.settings.hostKeySha256
  if (paired) hub.start()
  if (!paired || !process.argv.includes('--hidden')) windows.openMain(paired ? undefined : 'pairing')
})

app.on('second-instance', () => ctx?.windows.openMain())
app.on('before-quit', () => {
  if (ctx) ctx.windows.quitting = true
})
app.on('window-all-closed', () => {
  // программа живёт в трее
})
