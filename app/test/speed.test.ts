import { describe, expect, it } from 'vitest'
import { computeRates, parseStatLine, type StatSample } from '../src/shared/speed'

const base: StatSample = {
  t: 100, wanRx: 0, wanTx: 0, wanRxPkts: 0, wanTxPkts: 0, tunRx: 0, tunTx: 0, tunRxPkts: 0, tunTxPkts: 0
}

describe('computeRates', () => {
  it('splits download into VPN and direct, subtracting tunnel overhead', () => {
    const cur = { ...base, t: 101, wanRx: 12_500_000, tunRx: 10_000_000, tunRxPkts: 10_000 }
    const r = computeRates(base, cur)
    expect(r.vpnDown).toBe(80)
    expect(r.directDown).toBe(13.6)
    expect(r.down).toBe(93.6)
  })

  it('never shows negative speed when a counter resets', () => {
    const prev = { ...base, tunRx: 5_000_000, tunRxPkts: 5000, wanRx: 9_000_000 }
    const cur = { ...base, t: 101, tunRx: 1000, tunRxPkts: 1, wanRx: 9_500_000 }
    const r = computeRates(prev, cur)
    expect(r.vpnDown).toBe(0)
    for (const v of Object.values(r)) expect(v).toBeGreaterThanOrEqual(0)
  })

  it('returns zeros when no time passed', () => {
    const r = computeRates(base, { ...base, wanRx: 1000 })
    expect(Object.values(r).every((v) => v === 0)).toBe(true)
  })
})

describe('parseStatLine', () => {
  it('parses a sample line', () => {
    expect(parseStatLine('S 1700000000 1000 2000 10 20 300 400 3 4')).toEqual({
      t: 1700000000, wanRx: 1000, wanTx: 2000, wanRxPkts: 10, wanTxPkts: 20, tunRx: 300, tunTx: 400, tunRxPkts: 3, tunTxPkts: 4
    })
  })
  it('parses ping and health', () => {
    expect(parseStatLine('P -1')).toEqual({ ping: -1 })
    expect(parseStatLine('P 42')).toEqual({ ping: 42 })
    expect(parseStatLine('H 1')).toEqual({ health: true })
  })
  it('ignores garbage', () => {
    expect(parseStatLine('hello')).toBeNull()
    expect(parseStatLine('S 1 2')).toBeNull()
  })
})
