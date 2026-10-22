// Обработчики вызовов из окон (window.domovenok.*).
import { shell } from 'electron'
import { readFileSync } from 'node:fs'
import type { DomovenokCalls } from '../shared/ipc'
import type { ImportedProfile } from '../shared/types'
import { getAutostart, setAutostart } from './autostart'
import type { Context } from './context'
import { ImportError, importProfileFile, importVpnString } from './profile-import'
import { deployRouterFiles } from './router/deploy'

type Handlers = { [K in keyof DomovenokCalls]: (...a: Parameters<DomovenokCalls[K]>) => unknown }

const IMPORT_ERRORS: Record<string, string> = {
  not_vpn: 'Это не строка подключения Amnezia',
  admin_profile: 'Это админский профиль — его поддержка появится в разделе «Сервер»',
  no_config: 'В профиле нет нужных данных для подключения',
  bad_config: 'В профиле нет нужных данных для подключения'
}

export function baseHandlers(ctx: Context): Partial<Handlers> {
  const { hub, windows } = ctx
  const addProfile = async (read: () => ImportedProfile): Promise<string> => {
    let p: ImportedProfile
    try {
      p = read()
    } catch (e) {
      throw new Error(e instanceof ImportError ? IMPORT_ERRORS[e.code] : String(e))
    }
    await hub.run((api) => api.addProfile(p))
    return p.name
  }
  return {
    getStatus: () => hub.lastStatus,
    getConnection: () => hub.connection,
    setState: (s) => hub.run((api) => api.setState(s)),
    restart: () => hub.run((api) => api.restart()),
    profiles: () => hub.api().profiles(),
    importProfileFromPath: (path) => addProfile(() => importProfileFile(path, readFileSync(path, 'utf8'))),
    importProfileString: (s) => addProfile(() => importVpnString(s)),
    useProfile: (name) => hub.run((api) => api.useProfile(name)),
    removeProfile: (name) => hub.run((api) => api.removeProfile(name)),
    presets: () => hub.api().presets(),
    setPreset: (id, on) => hub.run((api) => api.setPreset(id, on)),
    updatePresets: () => hub.run((api) => api.updatePresets()),
    mine: () => hub.api().mine(),
    addMine: (kind, value) => hub.run((api) => api.addMine(kind, value)),
    removeMine: (kind, value) => hub.run((api) => api.removeMine(kind, value)),
    diag: () => hub.run((api) => api.diag()),
    routerInfo: async () => {
      const link = hub.link()
      const out = async (cmd: string): Promise<string> => (await link.exec(cmd)).stdout.toString().trim()
      return {
        host: ctx.settings.routerHost,
        version: hub.lastStatus?.version ?? '',
        model: await out('cat /tmp/sysinfo/model 2>/dev/null'),
        legacy: (await out('[ -x /usr/bin/wgsw ] && echo yes')) === 'yes'
      }
    },
    redeploy: async () => {
      const link = hub.link()
      const r = await deployRouterFiles(link, ctx.resourcesDir)
      ctx.settings.deployedVersion = r.version
      ctx.save()
      return { version: r.version }
    },
    openRouterWeb: () => void shell.openExternal(`http://${ctx.settings.routerHost}/`),
    openMain: (tab) => windows.openMain(tab),
    closeMini: () => windows.closeMini(),
    getAutostart: () => getAutostart(),
    setAutostart: (on) => {
      setAutostart(on)
      ctx.settings.autostart = on
      ctx.save()
    }
  }
}
