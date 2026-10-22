// Перенос: резервная копия на ПК -> запись новой настройки -> migrate.sh; откат из копии.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { MigrationPlan } from '../../shared/migration-plan'
import type { RouterLink } from '../router/api'

const BACKUP_PATHS = [
  '/usr/bin/wgsw', '/usr/bin/vpnmode', '/usr/bin/vps-check', '/usr/bin/blackbox', '/usr/lib/vpnctl.sh', '/etc/vpnsplit',
  '/etc/wg-profiles', '/etc/init.d/vpnsplit', '/etc/init.d/vpnawg', '/etc/hotplug.d/ntp/50-wg-after-timesync',
  '/etc/hotplug.d/iface/90-wan-direct-table', '/etc/crontabs/root', '/etc/config/dhcp', '/etc/config/network',
  '/etc/config/firewall'
]

function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export async function backupLegacy(link: RouterLink, backupsDir: string): Promise<string> {
  const present = (await link.exec('[ -x /usr/bin/wgsw ] && [ -d /etc/wg-profiles ] && echo yes')).stdout.toString().trim()
  if (present !== 'yes') throw new Error('На роутере нет старой установки: резервная копия не нужна, перенос уже выполнен')
  const list = BACKUP_PATHS.join(' ')
  const r = await link.exec(
    `cd / && tar czf - $(for p in ${list}; do [ -e "$p" ] && echo "\${p#/}"; done)`,
    { timeoutMs: 60000 }
  )
  if (r.code !== 0 || r.stdout.length === 0) throw new Error('Не удалось сделать резервную копию: перенос отменён')
  mkdirSync(backupsDir, { recursive: true })
  const path = join(backupsDir, `${stamp()}.tar.gz`)
  writeFileSync(path, r.stdout)
  return path
}

export async function commitMigration(
  link: RouterLink,
  plan: MigrationPlan,
  profilesContent: Record<string, string>,
  backupsDir: string
): Promise<{ backupPath: string; healthy: boolean }> {
  const backupPath = await backupLegacy(link, backupsDir)
  const E = '/etc/domovenok'
  await link.exec(`mkdir -p ${E}/profiles`)
  for (const p of plan.profiles) {
    await link.writeFile(`${E}/profiles/${p.name}.${p.type === 'awg' ? 'awg' : 'conf'}`, profilesContent[p.source] ?? '', '600')
  }
  const lines = (xs: string[]): string => xs.map((x) => x + '\n').join('')
  await link.writeFile(`${E}/profiles/.active`, plan.active + '\n', '644')
  await link.writeFile(`${E}/state`, plan.state + '\n', '644')
  await link.writeFile(`${E}/presets.enabled`, lines(plan.presetsOn), '644')
  await link.writeFile(`${E}/mine-domains.txt`, lines(plan.mineDomains), '644')
  await link.writeFile(`${E}/mine-ips.txt`, lines(plan.mineIps), '644')
  const r = await link.execJson('sh /usr/lib/domovenok/migrate.sh', z.object({ healthy: z.boolean() }), {
    timeoutMs: 180000
  })
  return { backupPath, healthy: r.healthy }
}

export async function rollbackMigration(link: RouterLink, archivePath: string): Promise<void> {
  await link.execJson('sh /usr/lib/domovenok/rollback.sh', z.object({ ok: z.literal(true) }), {
    stdin: readFileSync(archivePath),
    timeoutMs: 180000
  })
}
