// План переноса старой настройки (VPN Tray 1.0: wgsw + /etc/vpnsplit) в ДомовёнокNET.
import type { ProfileType, TunnelState } from './types'
import { normalizeDomain, normalizeIp, toProfileName } from './validate'

export interface LegacyInstall {
  profiles: { file: string; ext: 'conf' | 'awg' | 'vless' }[]
  active: string
  enabled: boolean
  mode: 'full' | 'list'
  tunnelDomains: string
  tunnelIps: string
  workIps: string
  extraFiles: string[]
}

export interface MigrationPlan {
  /** name — имя в ДомовёнокNET, source — имя файла в старой установке */
  profiles: { name: string; type: ProfileType; source: string }[]
  skippedProfiles: string[]
  active: string
  state: TunnelState
  presetsOn: string[]
  mineDomains: string[]
  mineIps: string[]
  removed: string[]
}

export type PresetContent = Record<string, { domains: string[]; subnets: string[] }>

/** Слишком широкие подборки: сами при переносе не включаются, только руками. */
const BROAD = new Set(['blocked_ru'])

/** Служебные адреса старой настройки: DNS роутера и проверочные адреса сторожа. */
const SERVICE_IPS = new Set([
  '1.1.1.1/32', '1.0.0.1/32', '8.8.8.8/32', '8.8.4.4/32', '94.140.14.14/32', '76.76.2.0/32', '208.67.220.220/32'
])

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/\r/g, '').trim())
    .filter((l) => l && !l.startsWith('#'))
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

function covers(presetDomain: string, domain: string): boolean {
  return domain === presetDomain || domain.endsWith('.' + presetDomain)
}

function toRange(cidr: string): [number, number] {
  const [ip, bits = '32'] = cidr.split('/')
  const n = ip.split('.').reduce((a, o) => a * 256 + Number(o), 0)
  const size = 2 ** (32 - Number(bits))
  const start = n - (n % size)
  return [start, start + size - 1]
}

function inside(inner: string, outer: string): boolean {
  const [a, b] = toRange(inner)
  const [c, d] = toRange(outer)
  return a >= c && b <= d
}

export function planMigration(old: LegacyInstall, presetContent: PresetContent): MigrationPlan {
  const domains = unique(lines(old.tunnelDomains).map(normalizeDomain).filter((d): d is string => !!d))
  const ips = unique(
    [...lines(old.tunnelIps), ...lines(old.workIps)]
      .map((ip) => normalizeIp(ip.includes('/') ? ip : ip + '/32'))
      .filter((ip): ip is string => !!ip && !SERVICE_IPS.has(ip))
  )

  const narrow = Object.entries(presetContent).filter(([id]) => !BROAD.has(id))
  const presetsOn = new Set<string>()
  const mineDomains = domains.filter((d) => {
    const hit = narrow.filter(([, p]) => p.domains.some((pd) => covers(pd, d)))
    hit.forEach(([id]) => presetsOn.add(id))
    return hit.length === 0
  })
  const mineIps = ips.filter((ip) => {
    const hit = narrow.filter(([, p]) => p.subnets.some((s) => inside(ip, s)))
    hit.forEach(([id]) => presetsOn.add(id))
    return hit.length === 0
  })

  const vless = old.profiles.filter((p) => p.ext === 'vless').map((p) => p.file)
  const activeIsVless = vless.includes(old.active)
  const removed = [
    'Списки «напрямую» (сайты, IP, порты, программы)',
    ...(vless.length ? [`VLESS-профили: ${vless.join(', ')}`] : []),
    'Журнал blackbox',
    'Проверка vps-check',
    'Список рабочих компьютеров (work-pc)',
    ...old.extraFiles
  ]

  const taken = new Set<string>()
  const profiles = old.profiles
    .filter((p) => p.ext !== 'vless')
    .map((p) => {
      const base = toProfileName(p.file)
      let name = base
      for (let i = 2; taken.has(name); i++) name = `${base.slice(0, 29)}_${i}`
      taken.add(name)
      return { name, type: (p.ext === 'awg' ? 'awg' : 'wg') as ProfileType, source: p.file }
    })
  return {
    profiles,
    skippedProfiles: vless,
    active: activeIsVless ? '' : (profiles.find((p) => p.source === old.active)?.name ?? ''),
    state: !old.enabled || activeIsVless ? 'off' : old.mode,
    presetsOn: [...presetsOn],
    mineDomains,
    mineIps,
    removed
  }
}
