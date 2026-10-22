// Мост между окном и main-процессом: window.domovenok
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CALLS, EVENTS } from '../shared/ipc'

const api: Record<string, unknown> = {
  pathForFile: (f: File) => webUtils.getPathForFile(f)
}
for (const m of CALLS) api[m] = (...args: unknown[]) => ipcRenderer.invoke('dn:call', m, args)
for (const e of EVENTS) {
  const name = 'on' + e[0].toUpperCase() + e.slice(1)
  api[name] = (cb: (v: unknown) => void) => {
    const h = (_: unknown, v: unknown): void => cb(v)
    ipcRenderer.on(`dn:${e}`, h)
    return () => ipcRenderer.removeListener(`dn:${e}`, h)
  }
}

contextBridge.exposeInMainWorld('domovenok', api)
