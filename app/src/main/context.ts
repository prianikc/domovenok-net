// Общее состояние main-процесса: настройки, ключ, центр состояния, окна.
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hub } from './hub'
import { loadSettings, saveSettings, type Settings } from './settings'
import { RouterClient } from './ssh/client'
import { loadOrCreateAppKey, type SecretStore } from './ssh/keys'
import type { Windows } from './windows'

export interface Context {
  dataDir: string
  resourcesDir: string
  settings: Settings
  save(): void
  appKey: { privateKey: string; publicKey: string }
  hub: Hub
  windows: Windows
}

function secretFile(dir: string): SecretStore {
  const f = join(dir, 'router_key.bin')
  return {
    read: () => (existsSync(f) ? Buffer.from(safeStorage.decryptString(readFileSync(f))) : null),
    write: (b) => writeFileSync(f, safeStorage.encryptString(b.toString('utf8')))
  }
}

export function createContext(windows: Windows): Context {
  const dataDir = app.getPath('userData')
  const settings = loadSettings(dataDir)
  const appKey = loadOrCreateAppKey(secretFile(dataDir))
  const hub = new Hub(async () => {
    const c = new RouterClient({ host: settings.routerHost, privateKey: appKey.privateKey, hostKeySha256: settings.hostKeySha256 })
    await c.connect()
    return c
  })
  return {
    dataDir,
    resourcesDir: app.isPackaged ? process.resourcesPath : join(__dirname, '../../..'),
    settings,
    save: () => saveSettings(dataDir, settings),
    appKey,
    hub,
    windows
  }
}
