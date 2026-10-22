// Чтение старой установки VPN Tray 1.0 с роутера.
import type { LegacyInstall } from '../../shared/migration-plan'
import { shq } from '../../shared/shell'
import type { RouterLink } from '../router/api'

/** Файлы /etc/vpnsplit из старого репозитория; всё остальное — «лишнее», удаляется с отметкой в плане. */
const KNOWN = new Set([
  'apply.sh', 'gen.sh', 'warm.sh', 'mode', 'vpnsplit.nft', 'direct-domains.txt', 'direct-ips.txt', 'direct-ports.txt',
  'direct-src.txt', 'tunnel-domains.txt', 'tunnel-ips.txt', 'work-ips.txt', 'work-pc.txt'
])

async function text(link: RouterLink, cmd: string): Promise<string> {
  return (await link.exec(cmd)).stdout.toString('utf8')
}

export async function detectLegacy(link: RouterLink): Promise<LegacyInstall | null> {
  if ((await text(link, '[ -x /usr/bin/wgsw ] && echo yes')).trim() !== 'yes') return null
  const files = (await text(link, 'ls /etc/wg-profiles 2>/dev/null')).split('\n').filter(Boolean)
  const profiles = files.flatMap((f) => {
    const m = /^(.+)\.(conf|awg|vless)$/.exec(f)
    return m ? [{ file: m[1], ext: m[2] as 'conf' | 'awg' | 'vless' }] : []
  })
  const extraFiles = (await text(link, 'ls /etc/vpnsplit 2>/dev/null'))
    .split('\n')
    .filter((f) => f && !KNOWN.has(f))
  const mode = (await text(link, 'cat /etc/vpnsplit/mode 2>/dev/null')).trim()
  return {
    profiles,
    active: (await text(link, 'cat /etc/wg-profiles/.active 2>/dev/null')).trim(),
    enabled: (await text(link, 'cat /etc/wg-profiles/.enabled 2>/dev/null')).trim() !== '0',
    mode: mode === 'list' ? 'list' : 'full',
    tunnelDomains: await text(link, 'cat /etc/vpnsplit/tunnel-domains.txt 2>/dev/null'),
    tunnelIps: await text(link, 'cat /etc/vpnsplit/tunnel-ips.txt 2>/dev/null'),
    workIps: await text(link, 'cat /etc/vpnsplit/work-ips.txt 2>/dev/null'),
    extraFiles
  }
}

/** Содержимое профилей, которые переносятся. */
export async function readLegacyProfiles(link: RouterLink, legacy: LegacyInstall): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const p of legacy.profiles.filter((x) => x.ext !== 'vless')) {
    out[p.file] = await text(link, `cat ${shq(`/etc/wg-profiles/${p.file}.${p.ext}`)}`)
  }
  return out
}

/** Скачанные подборки из кэша роутера: id -> домены и подсети. */
export async function readPresetCache(link: RouterLink): Promise<Record<string, { domains: string[]; subnets: string[] }>> {
  const raw = await text(
    link,
    'cd /etc/domovenok/cache 2>/dev/null && for f in *.domains *.subnets; do [ -f "$f" ] && echo "== $f" && cat "$f"; done'
  )
  const out: Record<string, { domains: string[]; subnets: string[] }> = {}
  let cur: string[] | undefined
  for (const line of raw.split('\n')) {
    const m = /^== (.+)\.(domains|subnets)$/.exec(line)
    if (m) {
      out[m[1]] ??= { domains: [], subnets: [] }
      cur = out[m[1]][m[2] as 'domains' | 'subnets']
    } else if (line.trim() && cur) cur.push(line.trim())
  }
  return out
}
