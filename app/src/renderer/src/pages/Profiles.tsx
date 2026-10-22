// «Профили»: список профилей VPN на роутере, подключение, удаление, добавление.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProfileList } from '../../../shared/ipc'
import { call, dn } from '../lib'

const TYPE_LABEL = { awg: 'AmneziaWG', wg: 'WireGuard' }

export function Profiles(): React.JSX.Element {
  const [list, setList] = useState<ProfileList>({ active: '', profiles: [] })
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [vpn, setVpn] = useState('')
  const [drag, setDrag] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    call(dn().profiles()).then(setList, (e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const run = async (label: string, fn: () => Promise<string | void>): Promise<void> => {
    setBusy(label)
    setError('')
    setMessage('')
    try {
      const m = await fn()
      if (m) setMessage(m)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const use = (name: string): Promise<void> =>
    run(name, async () => {
      const r = await call(dn().useProfile(name))
      if (r.rolledBack) return `Профиль ${name} не подключился, вернулся на ${r.profile}`
      if (!r.healthy) return 'Профиль не подключился: сервер не отвечает'
      return `Подключён профиль ${name}`
    })

  const remove = (name: string): void => {
    if (!window.confirm(`Удалить профиль ${name}?`)) return
    void run(name, async () => void (await call(dn().removeProfile(name))))
  }

  const addFiles = (files: FileList | null): void => {
    if (!files) return
    void run('add', async () => {
      const names: string[] = []
      for (const f of Array.from(files)) names.push(await call(dn().importProfileFromPath(dn().pathForFile(f))))
      return `Добавлен профиль: ${names.join(', ')}`
    })
  }

  const addString = (s: string): void => {
    void run('add', async () => {
      const name = await call(dn().importProfileString(s.trim()))
      setVpn('')
      return `Добавлен профиль: ${name}`
    })
  }

  return (
    <div>
      <div className="section">
        <h3>Профили на роутере</h3>
        <div className="list">
          {list.profiles.map((p) => {
            const active = p.name === list.active
            return (
              <div className="item" key={p.name}>
                <div className="grow">
                  <div>{p.name}</div>
                  <div className="small muted">{TYPE_LABEL[p.type]}</div>
                </div>
                {active ? (
                  <span className="small ok-c">● активный</span>
                ) : (
                  <button disabled={!!busy} onClick={() => void use(p.name)}>
                    {busy === p.name ? 'Подключаю…' : 'Подключить'}
                  </button>
                )}
                <button className="danger" disabled={active || !!busy} onClick={() => remove(p.name)}>
                  Удалить
                </button>
              </div>
            )
          })}
        </div>
        {message && <div className="small muted" style={{ marginTop: 8 }}>{message}</div>}
        {error && <div className="err">{error}</div>}
      </div>

      <div className="section">
        <h3>Добавить профиль</h3>
        <div
          className="tile"
          style={{ border: `1px dashed ${drag ? 'var(--vpn)' : 'var(--border)'}`, textAlign: 'center', padding: 20 }}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            addFiles(e.dataTransfer.files)
          }}
        >
          <div className="muted">Перетащите сюда файл .conf или .awg</div>
          <button style={{ marginTop: 10 }} disabled={!!busy} onClick={() => fileInput.current?.click()}>
            Выбрать файл
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".conf,.awg"
            multiple
            hidden
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input type="text" value={vpn} placeholder="Вставьте строку vpn://" onChange={(e) => setVpn(e.target.value)} />
          <button disabled={!!busy || !vpn.trim()} onClick={() => addString(vpn)}>
            Добавить
          </button>
          <button
            disabled={!!busy}
            onClick={() => void navigator.clipboard.readText().then((t) => (t.trim() ? addString(t) : undefined))}
          >
            Вставить из буфера
          </button>
        </div>
      </div>
    </div>
  )
}
