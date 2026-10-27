// Типизированные вызовы команды domovenok на роутере.
import type { EventEmitter } from 'node:events'
import { z, type ZodType } from 'zod'
import { shq } from '../../shared/shell'
import type { DiagResult, ImportedProfile, MineAdded, Preset, Status, TunnelState } from '../../shared/types'
import { isProfileName, MAX_ENTRIES, normalizeDomain, normalizeIp, parseEntries } from '../../shared/validate'

/** То, что API нужно от соединения (RouterClient или подделка в тестах). */
export interface RouterLink extends EventEmitter {
  exec(cmd: string, o?: { stdin?: string | Buffer; timeoutMs?: number }): Promise<{ code: number; stdout: Buffer; stderr: string }>
  execJson<T>(cmd: string, schema: ZodType<T>, o?: { stdin?: string | Buffer; timeoutMs?: number }): Promise<T>
  writeFile(path: string, content: Buffer | string, mode: string): Promise<void>
  stream(cmd: string, onLine: (l: string) => void, onEnd: (err?: Error) => void): { stop(): void }
  close(): void
}

const state = z.enum(['off', 'list', 'full'])

const statusSchema = z
  .object({
    state,
    profile: z.string(),
    type: z.enum(['awg', 'wg', '']),
    iface: z.string(),
    up: z.boolean(),
    hs_age: z.number(),
    healthy: z.boolean(),
    dns_fallback: z.boolean(),
    endpoint: z.string(),
    version: z.string()
  })
  .transform(
    (s): Status => ({
      state: s.state, profile: s.profile, type: s.type, iface: s.iface, up: s.up, hsAge: s.hs_age,
      healthy: s.healthy, dnsFallback: s.dns_fallback, endpoint: s.endpoint, version: s.version
    })
  )

const presetSchema = z.object({
  id: z.string(),
  title: z.string(),
  enabled: z.boolean(),
  updated: z.number(),
  domains: z.number(),
  subnets: z.number(),
  sample: z.array(z.string())
})

const diagSchema = z.object({
  checks: z.array(z.object({ id: z.string(), ok: z.boolean(), detail: z.string() })),
  verdict: z.enum(['ok', 'router', 'provider', 'server', 'profile']),
  message: z.string()
})

const ok = z.object({ ok: z.literal(true) })

function profileName(name: string): string {
  if (!isProfileName(name)) throw new Error('Недопустимое имя профиля')
  return shq(name)
}

export class RouterApi {
  constructor(private link: RouterLink) {}

  status(): Promise<Status> {
    return this.link.execJson('domovenok status', statusSchema, { timeoutMs: 20000 })
  }

  async setState(s: TunnelState): Promise<void> {
    await this.link.execJson(`domovenok state ${state.parse(s)}`, ok, { timeoutMs: 60000 })
  }

  restart(): Promise<{ profile: string; healthy: boolean }> {
    return this.link.execJson('domovenok restart', z.object({ profile: z.string(), healthy: z.boolean() }), {
      timeoutMs: 90000
    })
  }

  profiles(): Promise<{ active: string; profiles: { name: string; type: 'awg' | 'wg' }[] }> {
    return this.link.execJson(
      'domovenok profile list',
      z.object({ active: z.string(), profiles: z.array(z.object({ name: z.string(), type: z.enum(['awg', 'wg']) })) })
    )
  }

  async addProfile(p: ImportedProfile): Promise<void> {
    await this.link.execJson(`domovenok profile add ${profileName(p.name)} ${p.type === 'awg' ? 'awg' : 'wg'}`, ok, {
      stdin: p.config
    })
  }

  useProfile(name: string): Promise<{ profile: string; healthy: boolean; rolledBack: boolean }> {
    return this.link.execJson(
      `domovenok profile use ${profileName(name)}`,
      z
        .object({ profile: z.string(), healthy: z.boolean(), rolled_back: z.boolean() })
        .transform((r) => ({ profile: r.profile, healthy: r.healthy, rolledBack: r.rolled_back })),
      { timeoutMs: 120000 }
    )
  }

  async removeProfile(name: string): Promise<void> {
    await this.link.execJson(`domovenok profile rm ${profileName(name)}`, ok)
  }

  presets(): Promise<Preset[]> {
    return this.link.execJson('domovenok presets list', z.object({ presets: z.array(presetSchema) })).then((r) => r.presets)
  }

  async setPreset(id: string, on: boolean): Promise<void> {
    if (!/^[a-z0-9_]+$/.test(id)) throw new Error('Недопустимая подборка')
    await this.link.execJson(`domovenok presets set ${id} ${on ? 'on' : 'off'}`, ok, { timeoutMs: 120000 })
  }

  /** Без ids — каталог и включённые подборки; с ids — именно эти (в т. ч. выключенные). */
  async updatePresets(ids: string[] = []): Promise<{ updated: string[]; failed: string[] }> {
    if (ids.some((id) => !/^[a-z0-9_]+$/.test(id))) throw new Error('Недопустимая подборка')
    return this.link.execJson(
      ['domovenok presets update', ...ids].join(' '),
      z.object({ updated: z.array(z.string()), failed: z.array(z.string()) }),
      { timeoutMs: 300000 }
    )
  }

  mine(): Promise<{ domains: string[]; ips: string[] }> {
    return this.link.execJson('domovenok mine list', z.object({ domains: z.array(z.string()), ips: z.array(z.string()) }))
  }

  /** Сайты и IP/подсети вперемешку — одной командой; непонятое на роутер не уходит и возвращается в bad. */
  async addMineList(text: string): Promise<MineAdded> {
    const { domains, ips, bad } = parseEntries(text)
    const entries = [...domains, ...ips]
    if (entries.length > MAX_ENTRIES) throw new Error(`За один раз — не больше ${MAX_ENTRIES} записей, разбейте список на части`)
    if (!entries.length) return { domains: 0, ips: 0, existed: 0, bad }
    const r = await this.link
      .execJson(
        'domovenok mine add-list',
        z.object({ domains: z.number(), ips: z.number(), existed: z.number(), bad: z.array(z.string()) }),
        { stdin: entries.map((e) => e + '\n').join(''), timeoutMs: 60000 }
      )
      .catch((e: Error) => {
        // старые скрипты не знают add-list и отвечают подсказкой «mine list|add|rm»
        if (e.message === 'mine list|add|rm')
          throw new Error('На роутере старые скрипты — нажмите «Обновить скрипты на роутере» на вкладке «Роутер»')
        throw e
      })
    return { domains: r.domains, ips: r.ips, existed: r.existed, bad: [...bad, ...r.bad] }
  }

  async removeMine(kind: 'domain' | 'ip', value: string): Promise<void> {
    await this.link.execJson(`domovenok mine rm ${kind} ${shq(this.mineValue(kind, value))}`, ok, { timeoutMs: 60000 })
  }

  diag(): Promise<DiagResult> {
    return this.link.execJson('domovenok diag', diagSchema, { timeoutMs: 60000 })
  }

  private mineValue(kind: 'domain' | 'ip', value: string): string {
    const v = kind === 'domain' ? normalizeDomain(value) : normalizeIp(value)
    if (!v) throw new Error(kind === 'domain' ? 'Это не похоже на адрес сайта' : 'Это не похоже на IP-адрес или подсеть')
    return v
  }
}
