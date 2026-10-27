import { describe, expect, it } from 'vitest'
import { isProfileName, normalizeDomain, normalizeIp, parseEntries, toProfileName } from '../src/shared/validate'

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
  it('drops a leading wildcard or dot — subdomains are covered anyway', () => {
    expect(normalizeDomain('*.nexusmods.com')).toBe('nexusmods.com')
    expect(normalizeDomain('.nexusmods.com')).toBe('nexusmods.com')
    expect(normalizeDomain('https://*.NexusMods.com/x')).toBe('nexusmods.com')
  })
  it('rejects a wildcard in the middle', () => {
    expect(normalizeDomain('a.*.com')).toBeNull()
  })
})

describe('parseEntries', () => {
  it('splits by lines, commas, spaces and semicolons and sorts sites from IPs', () => {
    const r = parseEntries('*.nexusmods.com, nexus-cdn.com\n104.16.0.0/12; 1.2.3.4  https://www.example.org/page')
    expect(r).toEqual({
      domains: ['nexusmods.com', 'nexus-cdn.com', 'example.org'],
      ips: ['104.16.0.0/12', '1.2.3.4'],
      bad: []
    })
  })
  it('skips comments and empty lines', () => {
    expect(parseEntries('# для nexus\n\n  a.com  # основной\r\n')).toEqual({ domains: ['a.com'], ips: [], bad: [] })
  })
  it('collects what it did not understand and drops duplicates', () => {
    const r = parseEntries('a.com A.com localhost 300.1.1.1 a.com`x`')
    expect(r).toEqual({ domains: ['a.com'], ips: [], bad: ['localhost', '300.1.1.1', 'a.com`x`'] })
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
