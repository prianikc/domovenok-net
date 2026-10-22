import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type AddressInfo } from 'node:net'
import { utils } from 'ssh2'
import { pair } from '../src/main/ssh/pairing'
import { startFakeRouter, type FakeRouter } from './support/fake-router'

let router: FakeRouter
afterEach(async () => router?.close())

const appKey = utils.generateKeyPairSync('ed25519', { comment: 'domovenok' })

describe('pair', () => {
  it('asks for the root password once and installs the app key', async () => {
    router = await startFakeRouter({ password: 'secret' })
    let asked = 0
    const r = await pair('127.0.0.1', {
      port: router.port,
      appKey: { privateKey: appKey.private, publicKey: appKey.public },
      legacyKeys: [],
      askPassword: async () => {
        asked++
        return 'secret'
      }
    })
    r.client.close()
    expect(asked).toBe(1)
    expect(r.method).toBe('password')
    expect(router.commands.some((c) => c.includes(appKey.public.trim()) && c.includes('authorized_keys'))).toBe(true)

    const again = await pair('127.0.0.1', {
      port: router.port,
      appKey: { privateKey: appKey.private, publicKey: appKey.public },
      legacyKeys: [],
      askPassword: async () => {
        throw new Error('не должен спрашивать')
      }
    })
    again.client.close()
    expect(again.method).toBe('app-key')
  })

  it('uses a legacy key before asking for a password', async () => {
    router = await startFakeRouter({})
    const old = utils.generateKeyPairSync('ed25519')
    router.allowKey(old.public)
    const r = await pair('127.0.0.1', {
      port: router.port,
      appKey: { privateKey: appKey.private, publicKey: appKey.public },
      legacyKeys: [Buffer.from(old.private)],
      askPassword: async () => null
    })
    r.client.close()
    expect(r.method).toBe('legacy-key')
  })

  it('gives up when the person cancels the password prompt', async () => {
    router = await startFakeRouter({ password: 'secret' })
    await expect(
      pair('127.0.0.1', {
        port: router.port,
        appKey: { privateKey: appKey.private, publicKey: appKey.public },
        legacyKeys: [],
        askPassword: async () => null
      })
    ).rejects.toThrow(/пароль/)
  })
})

describe('pair when the router is unreachable', () => {
  it('fails fast without asking for a password', async () => {
    const srv = createServer()
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    const closedPort = (srv.address() as AddressInfo).port
    await new Promise((r) => srv.close(r))
    let asked = 0
    await expect(
      pair('127.0.0.1', {
        port: closedPort,
        appKey: { privateKey: appKey.private, publicKey: appKey.public },
        legacyKeys: [],
        askPassword: async () => {
          asked++
          return 'x'
        }
      })
    ).rejects.toThrow(/не отвечает/)
    expect(asked).toBe(0)
  })
})

describe('pair on a router without a root password', () => {
  it('still installs the app key, so a password set later does not lock the app out', async () => {
    router = await startFakeRouter({ blank: true })
    const r = await pair('127.0.0.1', {
      port: router.port,
      appKey: { privateKey: appKey.private, publicKey: appKey.public },
      legacyKeys: [],
      askPassword: async () => null
    })
    r.client.close()
    expect(router.commands.some((c) => c.includes(appKey.public.trim()) && c.includes('authorized_keys'))).toBe(true)
  })
})
