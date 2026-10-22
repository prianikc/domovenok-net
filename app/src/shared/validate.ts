// Нормализация того, что человек вводит руками. Невалидное -> null, в shell не попадает.
const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/

export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase()
  if (!s || /[\s;'"`$|&<>\\]/.test(s)) return null
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '')
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
