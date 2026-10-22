// «Роутер»: сведения, «Проверить», обновление скриптов, автозапуск, откат миграции.
import { useCallback, useEffect, useState } from 'react'
import type { DiagResult } from '../../../shared/types'
import { call, dn } from '../lib'

const CHECK_LABEL: Record<string, string> = {
  handshake: 'Рукопожатие с сервером',
  tunnel_ping: 'Сервер отвечает внутри туннеля',
  dns: 'DNS через туннель',
  wan: 'Интернет у провайдера',
  server_direct: 'Сервер доступен напрямую'
}

export function Router({ onMigrate }: { onMigrate: () => void }): React.JSX.Element {
  const [info, setInfo] = useState<{ host: string; version: string; model: string; legacy: boolean } | null>(null)
  const [diag, setDiag] = useState<DiagResult | null>(null)
  const [autostart, setAutostartState] = useState(false)
  const [backup, setBackup] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(() => {
    call(dn().routerInfo()).then(setInfo, (e: Error) => setMessage(e.message))
    call(dn().getAutostart()).then(setAutostartState, () => {})
    call(dn().migrationLastBackup()).then(setBackup, () => {})
  }, [])
  useEffect(load, [load])

  const act = async (label: string, fn: () => Promise<string | void>): Promise<void> => {
    setBusy(label)
    setMessage('')
    try {
      const m = await fn()
      if (m) setMessage(m)
      load()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      {info?.legacy && (
        <div className="note" style={{ marginBottom: 16 }}>
          На роутере ещё работает старая настройка VPN Tray.{' '}
          <button style={{ marginLeft: 8 }} onClick={onMigrate}>Перенести</button>
        </div>
      )}
      <div className="section">
        <h3>Роутер</h3>
        <div className="row">
          <div className="tile"><div className="lbl">Адрес</div>{info?.host || '—'}</div>
          <div className="tile"><div className="lbl">Модель</div>{info?.model || '—'}</div>
          <div className="tile"><div className="lbl">Скрипты</div>{info?.version || '—'}</div>
        </div>
      </div>

      <div className="section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Проверка</h3>
          <button disabled={!!busy} onClick={() => void act('diag', async () => setDiag(await call(dn().diag())))}>
            {busy === 'diag' ? 'Проверяю…' : 'Проверить'}
          </button>
        </div>
        {diag && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 18, marginBottom: 8 }} className={diag.verdict === 'ok' ? 'ok-c' : 'bad-c'}>
              {diag.message}
            </div>
            <div className="list">
              {diag.checks.map((c) => (
                <div className="item" key={c.id}>
                  <span className={c.ok ? 'ok-c' : 'bad-c'}>{c.ok ? '✓' : '✗'}</span>
                  <span className="grow">{CHECK_LABEL[c.id] ?? c.id}</span>
                  <span className="small muted">{c.detail}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <h3>Обслуживание</h3>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button disabled={!!busy} onClick={() => void act('deploy', async () => `Скрипты обновлены: ${(await call(dn().redeploy())).version}`)}>
            {busy === 'deploy' ? 'Обновляю…' : 'Обновить скрипты на роутере'}
          </button>
          <button onClick={() => void dn().openRouterWeb()}>Открыть веб-интерфейс роутера</button>
          {backup && (
            <button
              className="danger"
              disabled={!!busy}
              onClick={() =>
                window.confirm('Вернуть старую настройку VPN Tray из резервной копии?') &&
                void act('rollback', async () => {
                  await call(dn().migrationRollback())
                  return 'Старая настройка возвращена'
                })
              }
            >
              Откатить миграцию
            </button>
          )}
        </div>
        <label className="item" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={autostart}
            onChange={(e) => void call(dn().setAutostart(e.target.checked)).then(() => setAutostartState(e.target.checked))}
          />
          <span className="grow">Запускать вместе с Windows</span>
        </label>
        {message && <div className="small muted" style={{ marginTop: 8 }}>{message}</div>}
      </div>
    </div>
  )
}
