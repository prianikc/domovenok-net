// SSH-соединение с роутером (всегда root). У dropbear нет sftp, поэтому файлы пишем через cat.
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { Client, type ClientChannel } from 'ssh2'
import type { ZodType } from 'zod'
import { shq } from '../../shared/shell'

export class HostKeyMismatch extends Error {
  constructor() {
    super('Ключ роутера изменился: возможно, это другой роутер или его перепрошили')
  }
}

export interface ClientOptions {
  host: string
  port?: number
  privateKey?: Buffer | string
  password?: string
  hostKeySha256?: string
}

export interface ExecResult {
  code: number
  stdout: Buffer
  stderr: string
}

export interface ExecOptions {
  stdin?: string | Buffer
  timeoutMs?: number
}

/** Событие 'close' — соединение потеряно. */
export class RouterClient extends EventEmitter {
  private conn = new Client()
  private seenHostKey = ''

  constructor(private o: ClientOptions) {
    super()
  }

  connect(timeoutMs = 8000): Promise<{ hostKeySha256: string }> {
    return new Promise((resolve, reject) => {
      let mismatch = false
      this.conn
        .once('ready', () => {
          this.conn.on('close', () => this.emit('close'))
          resolve({ hostKeySha256: this.seenHostKey })
        })
        .once('error', (e) => reject(mismatch ? new HostKeyMismatch() : e))
        .connect({
          host: this.o.host,
          port: this.o.port ?? 22,
          username: 'root',
          privateKey: this.o.privateKey,
          password: this.o.password,
          readyTimeout: timeoutMs,
          keepaliveInterval: 10000,
          hostVerifier: (key: Buffer) => {
            this.seenHostKey = createHash('sha256').update(key).digest('base64')
            mismatch = !!this.o.hostKeySha256 && this.o.hostKeySha256 !== this.seenHostKey
            return !mismatch
          }
        })
    })
  }

  exec(cmd: string, o: ExecOptions = {}): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      this.conn.exec(cmd, (err, ch: ClientChannel) => {
        if (err) return reject(err)
        const out: Buffer[] = []
        let errText = ''
        let code = -1 // нет статуса выхода (обрыв, сигнал) — считаем ошибкой
        const timer = o.timeoutMs
          ? setTimeout(() => {
              ch.close()
              reject(new Error(`Роутер не ответил за отведённое время: ${cmd.split(' ')[0]}`))
            }, o.timeoutMs)
          : undefined
        ch.on('data', (d: Buffer) => out.push(d))
        ch.stderr.on('data', (d: Buffer) => (errText += d.toString()))
        ch.on('exit', (c: number | null) => (code = c ?? -1))
        ch.on('close', () => {
          clearTimeout(timer)
          resolve({ code, stdout: Buffer.concat(out), stderr: errText })
        })
        if (o.stdin !== undefined) ch.end(o.stdin)
        else ch.end()
      })
    })
  }

  async execJson<T>(cmd: string, schema: ZodType<T>, o?: ExecOptions): Promise<T> {
    const r = await this.exec(cmd, o)
    let json: unknown
    try {
      json = JSON.parse(r.stdout.toString('utf8'))
    } catch {
      throw new Error(r.stderr.trim() || `Непонятный ответ роутера на «${cmd}»`)
    }
    const j = json as { ok?: boolean; error?: string }
    if (j.ok === false) throw new Error(j.error || 'Ошибка на роутере')
    return schema.parse(json)
  }

  stream(cmd: string, onLine: (l: string) => void, onEnd: (err?: Error) => void): { stop(): void } {
    let ch: ClientChannel | undefined
    let stopped = false
    this.conn.exec(cmd, (err, c) => {
      if (err) return onEnd(err)
      ch = c
      if (stopped) return c.close()
      let buf = ''
      c.on('data', (d: Buffer) => {
        buf += d.toString()
        const parts = buf.split('\n')
        buf = parts.pop() ?? ''
        parts.forEach(onLine)
      })
      c.on('close', () => onEnd())
      c.end()
    })
    return {
      stop: () => {
        stopped = true
        ch?.close()
      }
    }
  }

  async writeFile(path: string, content: Buffer | string, mode: string): Promise<void> {
    const r = await this.exec(`cat > ${shq(path)} && chmod ${mode} ${shq(path)}`, { stdin: content })
    if (r.code !== 0) throw new Error(`Не удалось записать ${path}: ${r.stderr.trim()}`)
  }

  close(): void {
    this.conn.end()
  }
}
