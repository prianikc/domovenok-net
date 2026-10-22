// Настройки программы: %APPDATA%\DomovenokNET\settings.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Settings {
  routerHost: string
  hostKeySha256: string
  autostart: boolean
  deployedVersion: string
  /** резервная копия, сделанная при переносе старой настройки */
  migrationBackup?: string
}

const DEFAULTS: Settings = { routerHost: '', hostKeySha256: '', autostart: true, deployedVersion: '' }

export function loadSettings(dir: string): Settings {
  const f = join(dir, 'settings.json')
  if (!existsSync(f)) return { ...DEFAULTS }
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(f, 'utf8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(dir: string, s: Settings): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(s, null, 2))
}
