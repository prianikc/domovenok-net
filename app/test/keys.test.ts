import { describe, expect, it } from 'vitest'
import { loadOrCreateAppKey } from '../src/main/ssh/keys'
import { loadSettings, saveSettings } from '../src/main/settings'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('loadOrCreateAppKey', () => {
  it('creates an ed25519 key once and then reuses it', () => {
    let stored: Buffer | null = null
    const store = { read: () => stored, write: (b: Buffer) => (stored = b) }
    const a = loadOrCreateAppKey(store)
    const b = loadOrCreateAppKey(store)
    expect(a.publicKey).toMatch(/^ssh-ed25519 /)
    expect(b.publicKey).toBe(a.publicKey)
  })
})

describe('settings', () => {
  it('returns defaults and round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dn-'))
    expect(loadSettings(dir)).toEqual({ routerHost: '', hostKeySha256: '', autostart: true, deployedVersion: '' })
    saveSettings(dir, { routerHost: '192.168.1.1', hostKeySha256: 'x', autostart: false, deployedVersion: '2.0.0' })
    expect(loadSettings(dir).routerHost).toBe('192.168.1.1')
  })
})
