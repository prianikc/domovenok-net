// Контракт между окнами и main-процессом: window.domovenok.
import type { Rates } from './speed'
import type { Connection, DiagResult, Preset, Status, TunnelState } from './types'
import type { MigrationPlan } from './migration-plan'

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface ProfileList {
  active: string
  profiles: { name: string; type: 'awg' | 'wg' }[]
}

export interface PairingState {
  host: string
  step: 'idle' | 'connecting' | 'password' | 'deploying' | 'done' | 'error'
  message: string
  legacy: boolean
}

export interface MigrationResult {
  healthy: boolean
  directInternet: boolean
  backupPath: string
}

/** Методы, которые вызываются через ipc invoke. */
export interface DomovenokCalls {
  getStatus(): Status | null
  getConnection(): Connection
  setState(s: TunnelState): void
  restart(): { profile: string; healthy: boolean }
  profiles(): ProfileList
  importProfileFromPath(path: string): string
  importProfileString(s: string): string
  useProfile(name: string): { profile: string; healthy: boolean; rolledBack: boolean }
  removeProfile(name: string): void
  presets(): Preset[]
  setPreset(id: string, on: boolean): void
  updatePresets(): { updated: string[]; failed: string[] }
  mine(): { domains: string[]; ips: string[] }
  addMine(kind: 'domain' | 'ip', value: string): void
  removeMine(kind: 'domain' | 'ip', value: string): void
  diag(): DiagResult
  routerInfo(): { host: string; version: string; model: string; legacy: boolean }
  redeploy(): { version: string }
  openRouterWeb(): void
  openMain(tab?: string): void
  closeMini(): void
  getAutostart(): boolean
  setAutostart(on: boolean): void
  pairingState(): PairingState
  pairingStart(host?: string): PairingState
  pairingSubmitPassword(password: string | null): void
  migrationPlan(): MigrationPlan
  migrationCommit(): MigrationResult
  migrationRollback(): void
  migrationLastBackup(): string
}

type Promisify<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Result<Awaited<R>>> : never
}

export interface DomovenokEvents {
  onStatus(cb: (s: Status) => void): () => void
  onConnection(cb: (c: Connection) => void): () => void
  onRates(cb: (r: Rates) => void): () => void
  onPing(cb: (ms: number) => void): () => void
  onNavigate(cb: (tab: string) => void): () => void
  onPairing(cb: (p: PairingState) => void): () => void
}

export type DomovenokApi = Promisify<DomovenokCalls> & DomovenokEvents

export const EVENTS = ['status', 'connection', 'rates', 'ping', 'navigate', 'pairing'] as const

export const CALLS: (keyof DomovenokCalls)[] = [
  'getStatus', 'getConnection', 'setState', 'restart', 'profiles', 'importProfileFromPath', 'importProfileString',
  'useProfile', 'removeProfile', 'presets', 'setPreset', 'updatePresets', 'mine', 'addMine', 'removeMine', 'diag',
  'routerInfo', 'redeploy', 'openRouterWeb', 'openMain', 'closeMini', 'getAutostart', 'setAutostart',
  'pairingState', 'pairingStart', 'pairingSubmitPassword', 'migrationPlan', 'migrationCommit', 'migrationRollback',
  'migrationLastBackup'
]
