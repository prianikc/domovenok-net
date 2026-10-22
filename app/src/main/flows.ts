// Сопряжение с роутером и перенос старой настройки (вызовы pairing* и migration*).
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MigrationPlan } from '../shared/migration-plan'
import { planMigration } from '../shared/migration-plan'
import type { DomovenokCalls, MigrationResult, PairingState } from '../shared/ipc'
import type { Context } from './context'
import { removeLegacyApp } from './legacy-app'
import { detectLegacy, readLegacyProfiles, readPresetCache } from './migration/detect'
import { commitMigration, rollbackMigration } from './migration/run'
import { deployRouterFiles } from './router/deploy'
import { defaultGateway } from './ssh/gateway'
import { legacyKeyCandidates, pair, readLegacyKeys } from './ssh/pairing'

type Handlers = { [K in keyof DomovenokCalls]?: (...a: Parameters<DomovenokCalls[K]>) => unknown }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function flowHandlers(ctx: Context): Handlers {
  const backupsDir = join(ctx.dataDir, 'backups')
  let pairing: PairingState = {
    host: ctx.settings.routerHost,
    step: ctx.settings.hostKeySha256 ? 'done' : 'idle',
    message: '',
    legacy: false
  }
  let passwordWaiter: ((p: string | null) => void) | undefined
  let pending: { plan: MigrationPlan; profiles: Record<string, string> } | undefined

  const setPairing = (p: Partial<PairingState>): void => {
    pairing = { ...pairing, ...p }
    ctx.windows.send('pairing', pairing)
  }

  const runPairing = async (host: string): Promise<void> => {
    try {
      setPairing({ host, step: 'connecting', message: `Подключаюсь к роутеру ${host}…` })
      const r = await pair(host, {
        appKey: ctx.appKey,
        legacyKeys: readLegacyKeys(legacyKeyCandidates(app.getPath('appData'), app.getPath('home'))),
        askPassword: () =>
          new Promise((resolve) => {
            passwordWaiter = resolve
            setPairing({ step: 'password', message: 'Введите пароль root от роутера' })
          })
      })
      setPairing({ step: 'deploying', message: 'Устанавливаю ДомовёнокNET на роутер…' })
      const d = await deployRouterFiles(r.client, ctx.resourcesDir)
      r.client.close()
      Object.assign(ctx.settings, { routerHost: host, hostKeySha256: r.hostKeySha256, deployedVersion: d.version })
      ctx.save()
      ctx.hub.start()
      const missing = d.missing.length ? ` Не хватает пакетов: ${d.missing.join(', ')}.` : ''
      setPairing({ step: 'done', legacy: d.legacy, message: `Роутер подключён.${missing}` })
    } catch (e) {
      setPairing({ step: 'error', message: (e as Error).message })
    }
  }


  return {
    pairingState: () => pairing,
    pairingStart: (host) => {
      if (pairing.step === 'connecting' || pairing.step === 'deploying' || pairing.step === 'password') return pairing
      void (async () => runPairing(host || ctx.settings.routerHost || (await defaultGateway()) || '192.168.1.1'))()
      return { ...pairing, step: 'connecting' as const }
    },
    pairingSubmitPassword: (p) => {
      passwordWaiter?.(p)
      passwordWaiter = undefined
      if (p !== null) setPairing({ step: 'connecting', message: 'Проверяю пароль…' })
    },
    migrationPlan: async () => {
      const link = ctx.hub.link()
      const legacy = await detectLegacy(link)
      if (!legacy) throw new Error('Старая настройка на роутере не найдена')
      const api = ctx.hub.api()
      const ids = await api.presets().then((ps) => ps.map((p) => p.id), () => [] as string[])
      await api.updatePresets(ids).catch(() => undefined)
      const plan = planMigration(legacy, await readPresetCache(link))
      pending = { plan, profiles: await readLegacyProfiles(link, legacy) }
      return plan
    },
    migrationCommit: async (): Promise<MigrationResult> => {
      if (!pending) throw new Error('Сначала подготовьте перенос')
      const link = ctx.hub.link()
      const r = await commitMigration(link, pending.plan, pending.profiles, backupsDir)
      pending = undefined
      ctx.settings.migrationBackup = r.backupPath
      ctx.save()
      let healthy = r.healthy
      for (let i = 0; !healthy && i < 12; i++) {
        await sleep(5000)
        healthy = await ctx.hub
          .api()
          .status()
          .then((s) => s.healthy, () => false)
      }
      const directInternet = await ctx.hub
        .api()
        .diag()
        .then((d) => d.checks.find((c) => c.id === 'wan')?.ok ?? false, () => false)
      if (healthy) await removeLegacyApp().catch(() => [])
      return { healthy, directInternet, backupPath: r.backupPath }
    },
    migrationRollback: async () => {
      const b = ctx.settings.migrationBackup && existsSync(ctx.settings.migrationBackup) ? ctx.settings.migrationBackup : ''
      if (!b) throw new Error('Резервной копии нет')
      await rollbackMigration(ctx.hub.link(), b)
    },
    migrationLastBackup: () =>
      ctx.settings.migrationBackup && existsSync(ctx.settings.migrationBackup) ? ctx.settings.migrationBackup : ''
  }
}
