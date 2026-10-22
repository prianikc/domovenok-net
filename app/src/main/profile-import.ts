// Импорт профиля VPN: файл .conf/.awg или строка vpn:// из приложения AmneziaVPN.
import { inflateSync } from 'node:zlib'
import type { ImportedProfile, ImportErrorCode } from '../shared/types'
import { toProfileName } from '../shared/validate'

export class ImportError extends Error {
  constructor(public code: ImportErrorCode) {
    super(code)
  }
}

const AWG_KEYS = ['Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'H1', 'H2', 'H3', 'H4']
const REQUIRED = ['PrivateKey', 'Address', 'PublicKey', 'Endpoint']

function keys(config: string): Set<string> {
  return new Set(
    config
      .split(/\r?\n/)
      .map((l) => /^\s*([A-Za-z0-9]+)\s*=/.exec(l)?.[1])
      .filter((k): k is string => !!k)
  )
}

function fromConfig(name: string, config: string): ImportedProfile {
  const k = keys(config)
  if (!/^\s*\[Interface\]/m.test(config) || REQUIRED.some((r) => !k.has(r))) throw new ImportError('bad_config')
  return { name: toProfileName(name), type: AWG_KEYS.some((a) => k.has(a)) ? 'awg' : 'wg', config }
}

export function importProfileFile(fileName: string, text: string): ImportedProfile {
  return fromConfig(fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, ''), text)
}

function decodeJson(s: string): Record<string, unknown> {
  const buf = Buffer.from(s.trim().replace(/^vpn:\/\//, ''), 'base64url')
  const attempts = [(): Buffer => inflateSync(buf.subarray(4)), (): Buffer => buf]
  for (const attempt of attempts) {
    try {
      const json = JSON.parse(attempt().toString('utf8'))
      if (json && typeof json === 'object') return json
    } catch {
      // пробуем следующий формат
    }
  }
  throw new ImportError('not_vpn')
}

interface AmneziaContainer {
  awg?: { last_config?: string }
  wireguard?: { last_config?: string }
}

export function importVpnString(s: string): ImportedProfile {
  if (!/^\s*vpn:\/\//.test(s)) throw new ImportError('not_vpn')
  const json = decodeJson(s)
  const containers = (Array.isArray(json.containers) ? json.containers : []) as AmneziaContainer[]
  for (const c of containers) {
    const last = c.awg?.last_config ?? c.wireguard?.last_config
    if (!last) continue
    let config: unknown
    try {
      config = JSON.parse(last).config
    } catch {
      throw new ImportError('bad_config')
    }
    if (typeof config !== 'string') throw new ImportError('no_config')
    const name = String(json.description || json.hostName || 'profile')
    return fromConfig(name, config)
  }
  if (json.userName || json.password) throw new ImportError('admin_profile')
  throw new ImportError('no_config')
}
