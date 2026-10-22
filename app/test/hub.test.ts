import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hub } from '../src/main/hub'
import { FakeLink } from './support/fake-link'

const status = (healthy: boolean, state = 'list') =>
  JSON.stringify({
    ok: true, state, profile: 'p', type: 'awg', iface: 'awg0', up: true, hs_age: healthy ? 5 : 999999,
    healthy, dns_fallback: !healthy, endpoint: '1.2.3.4', version: '2.0.0'
  })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Hub', () => {
  it('goes offline on a failed connection and retries after 2 s', async () => {
    let attempts = 0
    const hub = new Hub(async () => {
      attempts++
      if (attempts === 1) throw new Error('нет связи')
      return new FakeLink(() => status(true))
    })
    const conn: string[] = []
    hub.on('connection', (c) => conn.push(c))
    hub.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(conn).toEqual(['offline'])
    await vi.advanceTimersByTimeAsync(2000)
    expect(attempts).toBe(2)
    expect(conn.at(-1)).toBe('online')
    hub.stop()
  })

  it('reports losing health once, and restoring it once', async () => {
    const answers = [status(true), status(false), status(false), status(true)]
    const hub = new Hub(async () => new FakeLink(() => answers.shift() ?? status(true)))
    const events: string[] = []
    hub.on('health-lost', () => events.push('lost'))
    hub.on('health-restored', () => events.push('restored'))
    hub.start()
    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(15000 * 3)
    expect(events).toEqual(['lost', 'restored'])
    hub.stop()
  })

  it('does not report a deliberately switched-off tunnel as lost', async () => {
    const hub = new Hub(async () => new FakeLink(() => status(false, 'off')))
    const lost = vi.fn()
    hub.on('health-lost', lost)
    hub.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(lost).not.toHaveBeenCalled()
    hub.stop()
  })

  it('turns two stat lines into one rates event while visible', async () => {
    const link = new FakeLink(() => status(true))
    link.streamLines = ['S 100 0 0 0 0 0 0 0 0', 'S 101 1250000 0 0 0 0 0 0 0', 'P 42']
    const hub = new Hub(async () => link)
    const rates = vi.fn()
    const ping = vi.fn()
    hub.on('rates', rates)
    hub.on('ping', ping)
    hub.setVisible(true)
    hub.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(rates).toHaveBeenCalledTimes(1)
    expect(rates.mock.calls[0][0].directDown).toBe(10)
    expect(ping).toHaveBeenCalledWith(42)
    hub.stop()
  })

  it('rejects API calls while offline', async () => {
    const hub = new Hub(async () => {
      throw new Error('нет')
    })
    hub.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(() => hub.api()).toThrow('Роутер не отвечает')
    hub.stop()
  })
})

describe('Hub.start twice', () => {
  it('connects only once', async () => {
    vi.useFakeTimers()
    let n = 0
    const hub = new Hub(async () => {
      n++
      return new FakeLink(() => status(true))
    })
    hub.start()
    hub.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(n).toBe(1)
    hub.stop()
  })
})

describe('Hub reconnect after a drop during an action', () => {
  it('keeps the reconnect timer when the action fails after the drop', async () => {
    vi.useFakeTimers()
    let n = 0
    let first: FakeLink | undefined
    const hub = new Hub(async () => {
      n++
      const l = new FakeLink((cmd) => (cmd.includes('restart') ? new Error('обрыв') : status(true)))
      if (!first) first = l
      return l
    })
    hub.start()
    await vi.advanceTimersByTimeAsync(10)
    const action = hub.run(async (api) => {
      first!.close()
      return api.restart()
    })
    await expect(action).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(2500)
    expect(n).toBe(2)
    expect(hub.connection).toBe('online')
    hub.stop()
  })
})
