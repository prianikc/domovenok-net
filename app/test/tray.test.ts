import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClickRouter, iconFor, tooltipFor } from '../src/main/tray-logic'
import type { Status } from '../src/shared/types'

const st = (o: Partial<Status>): Status => ({
  state: 'list', profile: 'nl', type: 'awg', iface: 'awg0', up: true, hsAge: 5, healthy: true,
  dnsFallback: false, endpoint: '', version: '', ...o
})

describe('iconFor', () => {
  it('grey when the router is unreachable', () => expect(iconFor('offline', st({}))).toBe('grey'))
  it('yellow while a command runs', () => expect(iconFor('busy', st({}))).toBe('yellow'))
  it('red when the tunnel is off', () => expect(iconFor('online', st({ state: 'off', healthy: false }))).toBe('red'))
  it('red when there is no handshake', () => expect(iconFor('online', st({ healthy: false }))).toBe('red'))
  it('green when the tunnel works', () => expect(iconFor('online', st({}))).toBe('green'))
  it('grey before the first status', () => expect(iconFor('online', null)).toBe('grey'))
})

describe('tooltipFor', () => {
  it('names the profile when VPN works', () =>
    expect(tooltipFor('online', st({}))).toBe('ДомовёнокNET — VPN работает · nl'))
  it('says the router does not answer', () => expect(tooltipFor('offline', null)).toBe('ДомовёнокNET — роутер не отвечает'))
})

describe('ClickRouter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a double click opens only the big window', () => {
    const single = vi.fn()
    const double = vi.fn()
    const r = new ClickRouter(single, double)
    r.click()
    vi.advanceTimersByTime(450)
    r.doubleClick()
    vi.advanceTimersByTime(1000)
    expect(double).toHaveBeenCalledTimes(1)
    expect(single).not.toHaveBeenCalled()
  })

  it('a single click opens the mini window after the delay', () => {
    const single = vi.fn()
    const r = new ClickRouter(single, vi.fn())
    r.click()
    vi.advanceTimersByTime(499)
    expect(single).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(single).toHaveBeenCalledTimes(1)
  })
})
