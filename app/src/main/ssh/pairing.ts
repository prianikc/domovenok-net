// Вход на роутер: ключ программы -> ключи старой программы -> без пароля -> пароль root.
// После входа не своим ключом прописываем ключ программы в authorized_keys.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shq } from '../../shared/shell'
import { HostKeyMismatch, RouterClient } from './client'

export interface AppKey {
  privateKey: string | Buffer
  publicKey: string
}

export interface PairDeps {
  appKey: AppKey
  legacyKeys: Buffer[]
  askPassword: () => Promise<string | null>
  port?: number
  hostKeySha256?: string
}

export type PairMethod = 'app-key' | 'legacy-key' | 'no-password' | 'password'

export interface PairResult {
  client: RouterClient
  hostKeySha256: string
  method: PairMethod
}

/** Пути к ключам старой программы VPN Tray. */
export function legacyKeyCandidates(appData: string, userProfile: string): string[] {
  const paths: string[] = []
  const ini = join(appData, 'VpnTray', 'config.ini')
  if (existsSync(ini)) {
    const m = /^\s*key\s*=\s*(.+?)\s*$/im.exec(readFileSync(ini, 'utf8'))
    if (m) paths.push(m[1])
  }
  paths.push('C:\\RouterVPN\\router_key', join(userProfile, '.ssh', 'id_ed25519'))
  return paths
}

export function readLegacyKeys(paths: string[]): Buffer[] {
  return paths.filter((p) => existsSync(p)).map((p) => readFileSync(p))
}

async function tryConnect(host: string, deps: PairDeps, auth: { privateKey?: string | Buffer; password?: string }) {
  const c = new RouterClient({ host, port: deps.port, hostKeySha256: deps.hostKeySha256, ...auth })
  try {
    const { hostKeySha256 } = await c.connect()
    return { client: c, hostKeySha256 }
  } catch (e) {
    c.close()
    if ((e as { level?: string }).level === 'client-authentication') return null
    if (e instanceof HostKeyMismatch) throw e
    throw new Error(`Роутер ${host} не отвечает`)
  }
}

async function installKey(c: RouterClient, publicKey: string): Promise<void> {
  const pub = publicKey.trim()
  const f = '/etc/dropbear/authorized_keys'
  await c.exec(`mkdir -p /etc/dropbear && touch ${f} && chmod 600 ${f} && (grep -qxF ${shq(pub)} ${f} || echo ${shq(pub)} >> ${f})`)
}

export async function pair(host: string, deps: PairDeps): Promise<PairResult> {
  const own = await tryConnect(host, deps, { privateKey: deps.appKey.privateKey })
  if (own) return { ...own, method: 'app-key' }

  let found: { client: RouterClient; hostKeySha256: string } | null = null
  let method: PairMethod = 'legacy-key'
  for (const key of deps.legacyKeys) {
    found = await tryConnect(host, deps, { privateKey: key })
    if (found) break
  }
  if (!found) {
    method = 'no-password'
    found = await tryConnect(host, deps, { password: '' })
  }
  for (let i = 0; !found && i < 3; i++) {
    const password = await deps.askPassword()
    if (password === null) break
    method = 'password'
    found = await tryConnect(host, deps, { password })
  }
  if (!found) throw new Error('Не удалось войти на роутер: нужен пароль root')
  await installKey(found.client, deps.appKey.publicKey)
  return { ...found, method }
}
