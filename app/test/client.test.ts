import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { HostKeyMismatch, RouterClient } from '../src/main/ssh/client'
import { startFakeRouter, type FakeRouter } from './support/fake-router'

let router: FakeRouter
let client: RouterClient | undefined
afterEach(async () => {
  client?.close()
  await router?.close()
})

async function connected(): Promise<RouterClient> {
  router = await startFakeRouter({ password: 'secret' })
  client = new RouterClient({ host: '127.0.0.1', port: router.port, password: 'secret' })
  await client.connect()
  return client
}

describe('RouterClient', () => {
  it('runs a command and returns stdout and exit code', async () => {
    const c = await connected()
    const r = await c.exec('fail')
    expect(r.code).toBe(3)
    expect(r.stdout.toString()).toContain('cmd:fail')
  })

  it('writes a file through cat with the path quoted', async () => {
    const c = await connected()
    await c.writeFile('/x y', 'a', '600')
    expect(router.commands.at(-1)).toBe("cat > '/x y' && chmod 600 '/x y'")
  })

  it('turns {"ok":false} into an error with the router message', async () => {
    const c = await connected()
    await expect(c.execJson('json:{"ok":false,"error":"нет профиля"}', z.object({}))).rejects.toThrow('нет профиля')
  })

  it('parses JSON through the schema', async () => {
    const c = await connected()
    const v = await c.execJson('json:{"ok":true,"state":"list"}', z.object({ state: z.string() }))
    expect(v.state).toBe('list')
  })

  it('refuses a router whose host key changed', async () => {
    router = await startFakeRouter({ password: 'secret' })
    client = new RouterClient({ host: '127.0.0.1', port: router.port, password: 'secret', hostKeySha256: 'AAAA' })
    await expect(client.connect()).rejects.toBeInstanceOf(HostKeyMismatch)
  })

  it('times out a hung command and stays usable', async () => {
    const c = await connected()
    await expect(c.exec('hang', { timeoutMs: 100 })).rejects.toThrow(/время/)
    expect((await c.exec('echo')).code).toBe(0)
  })
})

describe('RouterClient exit status', () => {
  it('treats a channel closed without an exit status as a failure', async () => {
    const c = await connected()
    const r = await c.exec('noexit')
    expect(r.code).not.toBe(0)
  })
})
