// Нормализация того, что человек вводит руками. Невалидное -> null, в shell не попадает.
const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/

export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase()
  if (!s || /[\s;'"`$|&<>\\]/.test(s)) return null
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '')
  // *.site.com и .site.com — то же, что site.com: роутер и так ведёт все поддомены
  s = s.replace(/^\*?\./, '')
  let host: string
  try {
    host = new URL('http://' + s).hostname
  } catch {
    return null
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '')
  return DOMAIN_RE.test(host) ? host : null
}

export function normalizeIp(input: string): string | null {
  const s = input.trim()
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(s)
  if (!m) return null
  if (m.slice(1, 5).some((o) => Number(o) > 255)) return null
  if (m[5] !== undefined && Number(m[5]) > 32) return null
  return s
}

/** Сколько записей можно добавить за один раз (то же ограничение на роутере). */
export const MAX_ENTRIES = 1000

/** Список вперемешку (строки, запятые, пробелы, ; и комментарии #) -> сайты, IP/подсети и непонятое. */
export function parseEntries(text: string): { domains: string[]; ips: string[]; bad: string[] } {
  const domains = new Set<string>()
  const ips = new Set<string>()
  const bad = new Set<string>()
  const tokens = text.split(/\r?\n/).flatMap((line) => line.replace(/#.*/, '').split(/[\s,;]+/))
  for (const t of tokens) {
    if (!t) continue
    const ip = normalizeIp(t)
    const domain = ip ? null : normalizeDomain(t)
    if (ip) ips.add(ip)
    else if (domain) domains.add(domain)
    else bad.add(t)
  }
  return { domains: [...domains], ips: [...ips], bad: [...bad] }
}

export function isProfileName(s: string): boolean {
  return /^[A-Za-z0-9_-]{1,32}$/.test(s)
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
}

export function toProfileName(s: string): string {
  const latin = [...s]
    .map((ch) => {
      const t = TRANSLIT[ch.toLowerCase()]
      if (t === undefined) return ch
      return ch === ch.toLowerCase() ? t : t.charAt(0).toUpperCase() + t.slice(1)
    })
    .join('')
  const name = latin.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 32)
  return name || 'profile'
}
