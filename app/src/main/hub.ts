// Центр состояния: держит соединение с роутером, опрашивает статус, ведёт поток табло.
// События: 'connection' (Connection), 'status' (Status), 'rates' (Rates), 'ping' (number),
//          'health-lost', 'health-restored'.
import { EventEmitter } from 'node:events'
import { computeRates, parseStatLine, type StatSample } from '../shared/speed'
import type { Connection, Status } from '../shared/types'
import { RouterApi, type RouterLink } from './router/api'

const RETRY_DELAYS = [2000, 5000, 10000, 30000]
const POLL_VISIBLE = 3000
const POLL_HIDDEN = 15000

export class Hub extends EventEmitter {
  private conn?: RouterLink
  private routerApi?: RouterApi
  private attempt = 0
  private timer?: ReturnType<typeof setTimeout>
  private visible = false
  private statsStream?: { stop(): void }
  private prevSample?: StatSample
  private lostHealth = false
  private stopped = false
  private started = false
  connection: Connection = 'offline'
  lastStatus: Status | null = null

  constructor(private connectFn: () => Promise<RouterLink>) {
    super()
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.stopped = false
    void this.connect()
  }

  stop(): void {
    this.stopped = true
    this.started = false
    clearTimeout(this.timer)
    this.statsStream?.stop()
    this.conn?.removeAllListeners('close')
    this.conn?.close()
    this.conn = undefined
  }

  api(): RouterApi {
    if (!this.routerApi || this.connection === 'offline') throw new Error('Роутер не отвечает')
    return this.routerApi
  }

  /** Текущее соединение (для заливки скриптов и миграции). */
  link(): RouterLink {
    if (!this.conn || this.connection === 'offline') throw new Error('Роутер не отвечает')
    return this.conn
  }

  setVisible(v: boolean): void {
    this.visible = v
    if (v && this.conn) this.startStream()
    if (!v) this.stopStream()
    if (this.conn) this.schedulePoll(v ? 0 : POLL_HIDDEN)
  }

  /** Выполнить действие, на время показывая жёлтый значок, и обновить статус. */
  async run<T>(fn: (api: RouterApi) => Promise<T>): Promise<T> {
    const api = this.api()
    this.setConnection('busy')
    try {
      return await fn(api)
    } finally {
      if (this.conn) this.setConnection('online')
      this.schedulePoll(0)
    }
  }

  private setConnection(c: Connection, force = false): void {
    if (c === this.connection && !force) return
    this.connection = c
    this.emit('connection', c)
  }

  private async connect(): Promise<void> {
    try {
      const link = await this.connectFn()
      if (this.stopped) return link.close()
      this.conn = link
      this.routerApi = new RouterApi(link)
      link.once('close', () => this.lost())
      this.attempt = 0
      this.setConnection('online')
      if (this.visible) this.startStream()
      await this.poll()
    } catch {
      this.lost()
    }
  }

  private lost(): void {
    this.stopStream()
    this.conn = undefined
    this.routerApi = undefined
    this.setConnection('offline', this.attempt === 0)
    if (this.stopped) return
    clearTimeout(this.timer)
    const delay = RETRY_DELAYS[Math.min(this.attempt, RETRY_DELAYS.length - 1)]
    this.attempt++
    this.timer = setTimeout(() => void this.connect(), delay)
  }

  private schedulePoll(ms: number): void {
    if (!this.conn) return // соединения нет: таймер занят переподключением
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.poll(), ms)
  }

  private async poll(): Promise<void> {
    if (!this.routerApi) return
    try {
      const s = await this.routerApi.status()
      this.lastStatus = s
      this.emit('status', s)
      const broken = s.state !== 'off' && !s.healthy
      if (broken && !this.lostHealth) this.emit('health-lost')
      if (!broken && this.lostHealth) this.emit('health-restored')
      this.lostHealth = broken
    } catch {
      this.conn?.close()
      return
    }
    if (!this.stopped) this.schedulePoll(this.visible ? POLL_VISIBLE : POLL_HIDDEN)
  }

  private startStream(): void {
    if (this.statsStream || !this.conn) return
    this.prevSample = undefined
    this.statsStream = this.conn.stream(
      'domovenok stats',
      (line) => this.onStatLine(line),
      () => {
        this.statsStream = undefined
      }
    )
  }

  private stopStream(): void {
    this.statsStream?.stop()
    this.statsStream = undefined
  }

  private onStatLine(line: string): void {
    const p = parseStatLine(line)
    if (!p) return
    if ('ping' in p) return void this.emit('ping', p.ping)
    if ('health' in p) return
    if (this.prevSample) this.emit('rates', computeRates(this.prevSample, p))
    this.prevSample = p
  }
}
