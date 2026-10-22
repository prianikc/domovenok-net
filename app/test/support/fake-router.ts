// Мини-SSH-сервер для тестов: пароль, ключи, команды с эхом и stdin.
import { Server, utils, type Connection, type ParsedKey } from 'ssh2'
import { timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'

export interface FakeRouter {
  port: number
  commands: string[]
  allowKey(pub: string): void
  close(): Promise<void>
}

export async function startFakeRouter(o: { password?: string } = {}): Promise<FakeRouter> {
  const hostKey = utils.generateKeyPairSync('ed25519').private
  const allowed: ParsedKey[] = []
  const commands: string[] = []
  const allowKey = (pub: string): void => {
    const k = utils.parseKey(pub)
    if (!(k instanceof Error)) allowed.push(Array.isArray(k) ? k[0] : k)
  }

  const server = new Server({ hostKeys: [hostKey] }, (client: Connection) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && o.password !== undefined && ctx.password === o.password) return ctx.accept()
      if (ctx.method === 'publickey') {
        const k = allowed.find(
          (a) => a.type === ctx.key.algo && a.getPublicSSH().length === ctx.key.data.length &&
            timingSafeEqual(a.getPublicSSH(), ctx.key.data)
        )
        if (k && (!ctx.signature || k.verify(ctx.blob!, ctx.signature, ctx.hashAlgo) === true)) return ctx.accept()
      }
      ctx.reject()
    })
    client.on('ready', () => {
      client.on('session', (accept) => {
        accept().on('exec', (acc, _rej, info): void => {
          const s = acc()
          commands.push(info.command)
          const m = /echo '([^']+)' >> \/etc\/dropbear\/authorized_keys/.exec(info.command)
          if (m) allowKey(m[1])
          if (info.command === 'hang') return
          if (info.command === 'noexit') {
            s.end()
            return
          }
          if (info.command.startsWith('json:')) {
            s.write(info.command.slice(5))
            s.exit(0)
            s.end()
            return
          }
          let input = ''
          s.on('data', (d: Buffer) => (input += d.toString()))
          s.on('end', () => {
            s.write(`cmd:${info.command}\nstdin:${input}`)
            s.exit(info.command === 'fail' ? 3 : 0)
            s.end()
          })
        })
      })
    })
    client.on('error', () => {})
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return {
    port: (server.address() as AddressInfo).port,
    commands,
    allowKey,
    close: () => new Promise((r) => server.close(() => r()))
  }
}
