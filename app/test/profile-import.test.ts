import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ImportError, importProfileFile, importVpnString } from '../src/main/profile-import'

const AWG = `[Interface]
PrivateKey = cHJpdmF0ZQ==
Address = 10.8.1.5/32
DNS = 1.1.1.1
Jc = 4
Jmin = 10
Jmax = 50
H1 = 1
[Peer]
PublicKey = cHVibGlj
Endpoint = 203.0.113.7:443
AllowedIPs = 0.0.0.0/0
`
const WG = AWG.replace(/^(Jc|Jmin|Jmax|H1) = .*\n/gm, '')

function vpnString(json: object, compress = true): string {
  const raw = Buffer.from(JSON.stringify(json))
  let buf = raw
  if (compress) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(raw.length)
    buf = Buffer.concat([len, deflateSync(raw)])
  }
  return 'vpn://' + buf.toString('base64url')
}

const amnezia = {
  description: 'Нидерланды',
  hostName: '203.0.113.7',
  containers: [{ container: 'amnezia-awg', awg: { last_config: JSON.stringify({ config: AWG }) } }]
}

describe('importProfileFile', () => {
  it('detects AmneziaWG by its obfuscation keys', () => {
    expect(importProfileFile('myvps.conf', AWG)).toEqual({ name: 'myvps', type: 'awg', config: AWG })
  })
  it('detects plain WireGuard', () => {
    expect(importProfileFile('home.conf', WG).type).toBe('wg')
  })
  it('rejects a config without Endpoint', () => {
    expect(() => importProfileFile('x.conf', WG.replace(/^Endpoint.*\n/m, ''))).toThrow(
      expect.objectContaining({ code: 'bad_config' })
    )
  })
})

describe('importVpnString', () => {
  it('reads a compressed Amnezia string', () => {
    const p = importVpnString(vpnString(amnezia))
    expect(p.config).toBe(AWG)
    expect(p.type).toBe('awg')
    expect(p.name).toBe('Niderlandy')
  })
  it('reads an uncompressed string', () => {
    expect(importVpnString(vpnString(amnezia, false)).config).toBe(AWG)
  })
  it('recognises an admin (full access) profile', () => {
    const admin = { hostName: '203.0.113.7', userName: 'root', password: 'x', containers: [{ container: 'amnezia-awg' }] }
    expect(() => importVpnString(vpnString(admin))).toThrow(expect.objectContaining({ code: 'admin_profile' }))
  })
  it('rejects garbage', () => {
    expect(() => importVpnString('vpn://мусор')).toThrow(ImportError)
    expect(() => importVpnString('vpn://мусор')).toThrow(expect.objectContaining({ code: 'not_vpn' }))
  })
})
