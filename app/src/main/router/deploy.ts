// Заливка скриптов на роутер: resources/router -> те же пути, resources/presets -> /etc/domovenok/seed.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import { z } from 'zod'
import type { RouterLink } from './api'

const MIN_FREE_KB = 2048

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function modeFor(remote: string): string {
  return /^\/usr\/bin\/|^\/usr\/lib\/domovenok\/.*\.sh$|^\/etc\/init\.d\/|^\/etc\/hotplug\.d\//.test(remote) ? '755' : '644'
}

const installSchema = z.object({
  version: z.string(),
  missing: z.array(z.string()),
  legacy: z.boolean(),
  free_kb: z.number()
})

export interface DeployResult {
  version: string
  missing: string[]
  legacy: boolean
  freeKb: number
}

export async function deployRouterFiles(link: RouterLink, resourcesDir: string): Promise<DeployResult> {
  const free = Number((await link.exec("df -k /overlay | awk 'NR == 2 { print $4 }'")).stdout.toString().trim())
  if (Number.isFinite(free) && free > 0 && free < MIN_FREE_KB)
    throw new Error(`На роутере мало места: нужно ~1,5 МБ, свободно ${free} КБ`)

  const files: { local: string; remote: string }[] = []
  const routerDir = join(resourcesDir, 'router')
  for (const f of walk(routerDir)) {
    const rel = relative(routerDir, f).split(sep).join('/')
    if (!rel.startsWith('tests/')) files.push({ local: f, remote: '/' + rel })
  }
  const presetsDir = join(resourcesDir, 'presets')
  for (const f of walk(presetsDir)) {
    files.push({ local: f, remote: '/etc/domovenok/seed/' + relative(presetsDir, f).split(sep).join('/') })
  }

  const dirs = [...new Set(files.map((f) => posix.dirname(f.remote)))]
  await link.exec(`mkdir -p ${dirs.map((d) => `'${d}'`).join(' ')}`)
  for (const f of files) await link.writeFile(f.remote, readFileSync(f.local), modeFor(f.remote))

  const r = await link.execJson('sh /usr/lib/domovenok/install.sh', installSchema, { timeoutMs: 120000 })
  return { version: r.version, missing: r.missing, legacy: r.legacy, freeKb: r.free_kb }
}
