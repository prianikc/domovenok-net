import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectLegacy } from '../src/main/migration/detect'
import { backupLegacy, commitMigration } from '../src/main/migration/run'
import type { MigrationPlan } from '../src/shared/migration-plan'
import { FakeLink } from './support/fake-link'

const plan: MigrationPlan = {
  profiles: [{ name: 'myvps_awg', type: 'awg', source: 'myvps_awg' }, { name: 'fr', type: 'wg', source: 'fr.old' }],
  skippedProfiles: [],
  active: 'myvps_awg',
  state: 'list',
  presetsOn: ['youtube', 'anthropic'],
  mineDomains: ['example-tracker.org'],
  mineIps: ['203.0.113.0/24'],
  removed: []
}
const content = { myvps_awg: '[Interface]\nA', 'fr.old': '[Interface]\nB' }

describe('commitMigration', () => {
  it('changes nothing when the backup fails', async () => {
    const link = new FakeLink((cmd) =>
      cmd.includes('tar czf') ? new Error('нет места') : cmd.includes('wgsw') ? 'yes' : '{"ok":true,"healthy":true}'
    )
    await expect(commitMigration(link, plan, content, mkdtempSync(join(tmpdir(), 'bk-')))).rejects.toThrow()
    expect(Object.keys(link.files)).toHaveLength(0)
    expect(link.calls.some((c) => c.cmd.includes('migrate.sh'))).toBe(false)
  })

  it('backs up, writes profiles, then settings, then runs migrate.sh', async () => {
    const order: string[] = []
    const link = new FakeLink((cmd) => {
      order.push(cmd.includes('tar czf') ? 'backup' : cmd.includes('migrate.sh') ? 'migrate' : 'other')
      return cmd.includes('tar czf') ? 'TARDATA' : cmd.includes('[ -x /usr/bin/wgsw ]') ? 'yes' : '{"ok":true,"healthy":true}'
    })
    const origWrite = link.writeFile.bind(link)
    link.writeFile = async (p, c, m) => {
      order.push(p.includes('/profiles/') ? 'profile' : 'setting')
      return origWrite(p, c, m)
    }
    const dir = mkdtempSync(join(tmpdir(), 'bk-'))
    const r = await commitMigration(link, plan, content, dir)
    expect(r.healthy).toBe(true)
    expect(readFileSync(r.backupPath, 'utf8')).toBe('TARDATA')
    const compact = order.filter((x, i) => x !== 'other' && x !== order[i - 1])
    expect(compact).toEqual(['backup', 'profile', 'setting', 'migrate'])
    expect(link.files['/etc/domovenok/profiles/myvps_awg.awg']).toEqual({ content: '[Interface]\nA', mode: '600' })
    expect(link.files['/etc/domovenok/profiles/fr.conf'].content).toBe('[Interface]\nB')
    expect(link.files['/etc/domovenok/presets.enabled'].content).toBe('youtube\nanthropic\n')
    expect(link.files['/etc/domovenok/state'].content).toBe('list\n')
    expect(link.files['/etc/domovenok/profiles/.active'].content).toBe('myvps_awg\n')
  })
})

describe('backupLegacy', () => {
  it('refuses when the old setup is already gone (a retried migration)', async () => {
    const link = new FakeLink((cmd) => (cmd.includes('tar czf') ? 'TARDATA' : ''))
    await expect(backupLegacy(link, mkdtempSync(join(tmpdir(), 'bk-')))).rejects.toThrow('старой установки')
    expect(link.calls.some((c) => c.cmd.includes('tar czf'))).toBe(false)
  })

  it('refuses an empty archive', async () => {
    const link = new FakeLink((cmd) => (cmd.startsWith('[ -x') ? 'yes' : ''))
    await expect(backupLegacy(link, mkdtempSync(join(tmpdir(), 'bk-')))).rejects.toThrow('резервную копию')
  })
})

describe('detectLegacy', () => {
  it('returns null on a router without the old setup', async () => {
    expect(await detectLegacy(new FakeLink(() => ''))).toBeNull()
  })

  it('reads profiles, state and lists', async () => {
    const link = new FakeLink((cmd) => {
      if (cmd.includes('[ -x /usr/bin/wgsw ]')) return 'yes'
      if (cmd.startsWith('ls /etc/wg-profiles')) return 'myvps_awg.awg\nfrance.conf\nold.vless\n'
      if (cmd.startsWith('ls /etc/vpnsplit')) return 'apply.sh\nmode\nru-routes.txt\ntunnel-domains.txt\nupdate-ru.sh\n'
      if (cmd.includes('.active')) return 'myvps_awg\n'
      if (cmd.includes('.enabled')) return ''
      if (cmd.includes('/mode')) return 'list\n'
      if (cmd.includes('tunnel-domains')) return 'claude.ai\n'
      return ''
    })
    const l = await detectLegacy(link)
    expect(l).toMatchObject({
      active: 'myvps_awg',
      enabled: true,
      mode: 'list',
      tunnelDomains: 'claude.ai\n',
      extraFiles: ['ru-routes.txt', 'update-ru.sh']
    })
    expect(l?.profiles).toEqual([
      { file: 'myvps_awg', ext: 'awg' },
      { file: 'france', ext: 'conf' },
      { file: 'old', ext: 'vless' }
    ])
  })
})
