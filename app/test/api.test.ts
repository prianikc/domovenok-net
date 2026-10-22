import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RouterApi } from '../src/main/router/api'
import { deployRouterFiles } from '../src/main/router/deploy'
import { FakeLink } from './support/fake-link'

const STATUS =
  '{"ok":true,"state":"list","profile":"myvps_awg","type":"awg","iface":"awg0","up":true,"hs_age":12,"healthy":true,"dns_fallback":false,"endpoint":"1.2.3.4","version":"2.0.0"}'

describe('RouterApi', () => {
  it('maps status into camelCase', async () => {
    const api = new RouterApi(new FakeLink(() => STATUS))
    expect(await api.status()).toMatchObject({ state: 'list', hsAge: 12, dnsFallback: false, healthy: true })
  })

  it('rejects a status without required fields', async () => {
    const api = new RouterApi(new FakeLink(() => '{"ok":true,"state":"list"}'))
    await expect(api.status()).rejects.toThrow()
  })

  it('never sends an invalid site to the router', async () => {
    const link = new FakeLink()
    const api = new RouterApi(link)
    await expect(api.addMine('domain', 'a.com;reboot')).rejects.toThrow()
    expect(link.calls).toHaveLength(0)
  })

  it('normalizes and quotes a site', async () => {
    const link = new FakeLink()
    await new RouterApi(link).addMine('domain', 'https://www.YouTube.com/x')
    expect(link.calls[0].cmd).toBe("domovenok mine add domain 'youtube.com'")
  })

  it('sends a profile config through stdin', async () => {
    const link = new FakeLink(() => '{"ok":true,"name":"fr"}')
    await new RouterApi(link).addProfile({ name: 'fr', type: 'wg', config: '[Interface]\n' })
    expect(link.calls[0]).toEqual({ cmd: "domovenok profile add 'fr' wg", stdin: '[Interface]\n' })
  })

  it('reports a rollback when switching profiles', async () => {
    const link = new FakeLink(() => '{"ok":true,"profile":"old","healthy":true,"rolled_back":true}')
    expect(await new RouterApi(link).useProfile('new')).toEqual({ profile: 'old', healthy: true, rolledBack: true })
  })
})

describe('deployRouterFiles', () => {
  function resources(): string {
    const dir = mkdtempSync(join(tmpdir(), 'res-'))
    mkdirSync(join(dir, 'router/usr/bin'), { recursive: true })
    mkdirSync(join(dir, 'router/usr/lib/domovenok'), { recursive: true })
    mkdirSync(join(dir, 'router/tests'), { recursive: true })
    mkdirSync(join(dir, 'presets/own'), { recursive: true })
    writeFileSync(join(dir, 'router/usr/bin/domovenok'), '#!/bin/sh')
    writeFileSync(join(dir, 'router/usr/lib/domovenok/install.sh'), '#!/bin/sh')
    writeFileSync(join(dir, 'router/tests/x.bats'), '')
    writeFileSync(join(dir, 'presets/catalog.txt'), 'a|A||')
    writeFileSync(join(dir, 'presets/own/anthropic.lst'), 'anthropic.com')
    return dir
  }

  it('uploads router files with modes, seeds presets and runs install', async () => {
    const link = new FakeLink((cmd) =>
      cmd.startsWith('df')
        ? '36000'
        : cmd.includes('install.sh')
          ? '{"ok":true,"version":"2.0.0","missing":[],"legacy":true,"free_kb":36000}'
          : ''
    )
    const r = await deployRouterFiles(link, resources())
    expect(r).toEqual({ version: '2.0.0', missing: [], legacy: true, freeKb: 36000 })
    expect(link.files['/usr/bin/domovenok'].mode).toBe('755')
    expect(link.files['/usr/lib/domovenok/install.sh'].mode).toBe('755')
    expect(link.files['/etc/domovenok/seed/catalog.txt'].mode).toBe('644')
    expect(link.files['/etc/domovenok/seed/own/anthropic.lst']).toBeDefined()
    expect(Object.keys(link.files).some((f) => f.includes('tests'))).toBe(false)
  })

  it('refuses when the router is almost full', async () => {
    const link = new FakeLink((cmd) => (cmd.startsWith('df') ? '900' : ''))
    await expect(deployRouterFiles(link, resources())).rejects.toThrow('На роутере мало места: нужно ~1,5 МБ, свободно 900 КБ')
    expect(Object.keys(link.files)).toHaveLength(0)
  })
})

describe('RouterApi.updatePresets with ids', () => {
  it('updates the listed presets, even disabled ones', async () => {
    const link = new FakeLink(() => '{"ok":true,"updated":["a"],"failed":[]}')
    await new RouterApi(link).updatePresets(['youtube', 'blocked_ru'])
    expect(link.calls[0].cmd).toBe('domovenok presets update youtube blocked_ru')
  })
  it('rejects a bad id', async () => {
    const link = new FakeLink()
    await expect(new RouterApi(link).updatePresets(['a;b'])).rejects.toThrow()
    expect(link.calls).toHaveLength(0)
  })
})
