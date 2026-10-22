// Подделка соединения с роутером: отвечает по таблице команд.
import { EventEmitter } from 'node:events'
import type { ZodType } from 'zod'
import type { RouterLink } from '../../src/main/router/api'

export class FakeLink extends EventEmitter implements RouterLink {
  calls: { cmd: string; stdin?: string | Buffer }[] = []
  files: Record<string, { content: string; mode: string }> = {}
  streamLines: string[] = []
  constructor(public answer: (cmd: string) => string | Error = () => '{"ok":true}') {
    super()
  }
  async exec(cmd: string, o: { stdin?: string | Buffer } = {}) {
    this.calls.push({ cmd, stdin: o.stdin })
    const a = this.answer(cmd)
    if (a instanceof Error) throw a
    return { code: 0, stdout: Buffer.from(a), stderr: '' }
  }
  async execJson<T>(cmd: string, schema: ZodType<T>, o?: { stdin?: string | Buffer }): Promise<T> {
    const r = await this.exec(cmd, o)
    const j = JSON.parse(r.stdout.toString())
    if (j.ok === false) throw new Error(j.error)
    return schema.parse(j)
  }
  async writeFile(path: string, content: Buffer | string, mode: string) {
    this.files[path] = { content: content.toString(), mode }
  }
  stream(_cmd: string, onLine: (l: string) => void) {
    this.streamLines.forEach(onLine)
    return { stop: () => {} }
  }
  close() {
    this.emit('close')
  }
}
