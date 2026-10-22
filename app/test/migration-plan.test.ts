import { describe, expect, it } from 'vitest'
import { planMigration, type LegacyInstall } from '../src/shared/migration-plan'

const legacy = (over: Partial<LegacyInstall> = {}): LegacyInstall => ({
  profiles: [
    { file: 'myvps_awg', ext: 'awg' },
    { file: 'france', ext: 'conf' },
    { file: 'old_vless', ext: 'vless' }
  ],
  active: 'myvps_awg',
  enabled: true,
  mode: 'list',
  tunnelDomains: `# --- Служебное ---
api.ipify.org
# --- Anthropic ---
anthropic.com
claude.ai
# --- YouTube ---
youtube.com
m.youtube.com
# --- Личное ---
example-tracker.org\r
`,
  tunnelIps: `# DNS
1.1.1.1/32
8.8.8.8/32
# сторож
94.140.14.14/32
# Telegram
91.108.4.0/22
# своё
203.0.113.0/24
`,
  workIps: `160.79.104.0/23
198.51.100.7/32
`,
  extraFiles: ['ru-routes.txt', 'update-ru.sh'],
  ...over
})

const presets = {
  anthropic: { domains: ['anthropic.com', 'claude.ai'], subnets: ['160.79.104.0/23'] },
  youtube: { domains: ['youtube.com', 'googlevideo.com'], subnets: [] },
  telegram: { domains: ['telegram.org'], subnets: ['91.108.4.0/22', '149.154.160.0/20'] },
  discord: { domains: ['discord.com'], subnets: [] }
}

describe('planMigration', () => {
  it('turns on presets that cover old domains and keeps the rest as my sites', () => {
    const p = planMigration(legacy(), presets)
    expect(p.presetsOn.sort()).toEqual(['anthropic', 'telegram', 'youtube'])
    expect(p.mineDomains).toEqual(['api.ipify.org', 'example-tracker.org'])
  })

  it('treats subdomains as covered', () => {
    expect(planMigration(legacy(), presets).mineDomains).not.toContain('m.youtube.com')
  })

  it('drops service addresses and keeps uncovered subnets as my IPs', () => {
    const p = planMigration(legacy(), presets)
    expect(p.mineIps).toEqual(['203.0.113.0/24', '198.51.100.7/32'])
  })

  it('moves profiles and skips VLESS', () => {
    const p = planMigration(legacy(), presets)
    expect(p.profiles).toEqual([
      { name: 'myvps_awg', type: 'awg', source: 'myvps_awg' },
      { name: 'france', type: 'wg', source: 'france' }
    ])
    expect(p.skippedProfiles).toEqual(['old_vless'])
    expect(p.active).toBe('myvps_awg')
    expect(p.state).toBe('list')
  })

  it('keeps a disabled tunnel off', () => {
    expect(planMigration(legacy({ enabled: false }), presets).state).toBe('off')
  })

  it('turns the tunnel off when the active profile was VLESS', () => {
    const p = planMigration(legacy({ active: 'old_vless' }), presets)
    expect(p.state).toBe('off')
    expect(p.active).toBe('')
  })

  it('loses nothing when presets could not be downloaded', () => {
    const p = planMigration(legacy(), {})
    expect(p.presetsOn).toEqual([])
    expect(p.mineDomains).toEqual([
      'api.ipify.org', 'anthropic.com', 'claude.ai', 'youtube.com', 'm.youtube.com', 'example-tracker.org'
    ])
    expect(p.mineIps).toEqual(['91.108.4.0/22', '203.0.113.0/24', '160.79.104.0/23', '198.51.100.7/32'])
  })

  it('lists what will be removed in plain words', () => {
    const p = planMigration(legacy(), presets)
    expect(p.removed).toEqual([
      'Списки «напрямую» (сайты, IP, порты, программы)',
      'VLESS-профили: old_vless',
      'Журнал blackbox',
      'Проверка vps-check',
      'Список рабочих компьютеров (work-pc)',
      'ru-routes.txt',
      'update-ru.sh'
    ])
  })
})

describe('planMigration fixes', () => {
  it('never switches on the broad «blocked in RF» preset by itself', () => {
    const p = planMigration(legacy(), { ...presets, blocked_ru: { domains: ['youtube.com', 'example-tracker.org'], subnets: [] } })
    expect(p.presetsOn).not.toContain('blocked_ru')
    expect(p.mineDomains).toContain('example-tracker.org')
  })

  it('cleans up profile names and keeps the original file as source', () => {
    const p = planMigration(
      legacy({ profiles: [{ file: 'my vps.1', ext: 'awg' }, { file: 'my_vps_1', ext: 'conf' }], active: 'my vps.1' }),
      presets
    )
    expect(p.profiles).toEqual([
      { name: 'my_vps_1', type: 'awg', source: 'my vps.1' },
      { name: 'my_vps_1_2', type: 'wg', source: 'my_vps_1' }
    ])
    expect(p.active).toBe('my_vps_1')
  })
})
