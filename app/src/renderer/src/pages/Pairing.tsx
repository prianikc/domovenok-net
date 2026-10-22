// Первое подключение к роутеру: адрес, при необходимости пароль root, установка скриптов.
import { useEffect, useState } from 'react'
import type { PairingState } from '../../../shared/ipc'
import { call, dn } from '../lib'

export function Pairing({ state }: { state: PairingState }): React.JSX.Element {
  const [host, setHost] = useState(state.host)
  const [password, setPassword] = useState('')
  useEffect(() => setHost((h) => h || state.host), [state.host])
  const busy = state.step === 'connecting' || state.step === 'deploying'
  const start = (): void => void call(dn().pairingStart(host.trim() || undefined))
  return (
    <div className="center" style={{ maxWidth: 420, margin: '40px auto', gap: 14 }}>
      <h2 style={{ margin: 0, fontWeight: 400 }}>Подключение к роутеру</h2>
      <div className="muted">
        ДомовёнокNET работает с роутером на OpenWrt. Обычно его адрес определяется сам — просто нажмите «Подключиться».
      </div>
      <input type="text" value={host} placeholder="Адрес роутера, например 192.168.1.1" onChange={(e) => setHost(e.target.value)} />
      {state.step === 'password' ? (
        <>
          <input
            type="password"
            value={password}
            placeholder="Пароль root"
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void dn().pairingSubmitPassword(password)}
          />
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="primary" onClick={() => void dn().pairingSubmitPassword(password)}>Войти</button>
            <button onClick={() => void dn().pairingSubmitPassword(null)}>Отмена</button>
          </div>
        </>
      ) : (
        <button className="primary" disabled={busy} onClick={start}>
          {busy ? 'Подключаюсь…' : state.step === 'error' ? 'Попробовать снова' : 'Подключиться'}
        </button>
      )}
      {state.message && <div className={state.step === 'error' ? 'err' : 'muted'}>{state.message}</div>}
    </div>
  )
}
