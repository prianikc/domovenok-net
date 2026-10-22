import { describe, expect, it } from 'vitest'
import { isProfileName, normalizeDomain, normalizeIp, toProfileName } from '../src/shared/validate'

describe('normalizeDomain', () => {
  it('strips scheme, www, path and case', () => {
    expect(normalizeDomain('https://www.YouTube.com/watch?v=1')).toBe('youtube.com')
  })
  it('trims spaces', () => {
    expect(normalizeDomain(' claude.ai ')).toBe('claude.ai')
  })
  it('converts cyrillic domains to punycode', () => {
    expect(normalizeDomain('пример.рф')).toBe('xn--e1afmkfd.xn--p1ai')
  })
  it('rejects shell injection', () => {
    expect(normalizeDomain('a.com;reboot')).toBeNull()
  })
  it('rejects names without a dot', () => {
    expect(normalizeDomain('localhost')).toBeNull()
  })
  it('drops a port', () => {
    expect(normalizeDomain('example.org:8443')).toBe('example.org')
  })
})

describe('normalizeIp', () => {
  it('accepts an address', () => expect(normalizeIp('1.2.3.4')).toBe('1.2.3.4'))
  it('accepts a subnet', () => expect(normalizeIp(' 1.2.3.0/24 ')).toBe('1.2.3.0/24'))
  it('rejects a /33 mask', () => expect(normalizeIp('1.2.3.0/33')).toBeNull())
  it('rejects octets above 255', () => expect(normalizeIp('300.1.1.1')).toBeNull())
  it('rejects garbage', () => expect(normalizeIp('1.2.3.4; reboot')).toBeNull())
})

describe('profile names', () => {
  it('validates the router name format', () => {
    expect(isProfileName('myvps_awg')).toBe(true)
    expect(isProfileName('../x')).toBe(false)
    expect(isProfileName('a'.repeat(33))).toBe(false)
  })
  it('makes a valid name from anything', () => {
    expect(toProfileName('Мой сервер (NL)')).toBe('Moy_server_NL')
    expect(isProfileName(toProfileName('!!!'))).toBe(true)
    expect(toProfileName('x'.repeat(50))).toHaveLength(32)
  })
})
