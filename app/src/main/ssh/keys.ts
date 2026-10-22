// Собственный SSH-ключ программы. Хранилище шифрует его (в программе — safeStorage).
import { utils } from 'ssh2'

export interface SecretStore {
  read(): Buffer | null
  write(data: Buffer): void
}

export function loadOrCreateAppKey(store: SecretStore): { privateKey: string; publicKey: string } {
  const saved = store.read()
  if (saved) return JSON.parse(saved.toString('utf8'))
  const k = utils.generateKeyPairSync('ed25519', { comment: 'domovenok-net' })
  const key = { privateKey: k.private, publicKey: k.public }
  store.write(Buffer.from(JSON.stringify(key)))
  return key
}
