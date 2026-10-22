// «Списки»: подборки сервисов и свои сайты/IP — всё это идёт через VPN.
import { useCallback, useEffect, useState } from 'react'
import type { Preset } from '../../../shared/types'
import { normalizeDomain, normalizeIp } from '../../../shared/validate'
import { call, dn } from '../lib'

function sampleText(p: Preset): string {
  const more = p.domains + p.subnets - p.sample.length
  return p.sample.join(', ') + (more > 0 ? ` … и ещё ${more}` : '')
}

function updatedText(p: Preset): string {
  return p.updated ? `обновлено ${new Date(p.updated * 1000).toLocaleDateString('ru-RU')}` : 'ещё не скачано'
}

function MineList({
  kind,
  items,
  placeholder,
  invalid,
  onChange
}: {
  kind: 'domain' | 'ip'
  items: string[]
  placeholder: string
  invalid: string
  onChange: () => void
}): React.JSX.Element {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const add = async (): Promise<void> => {
    const v = kind === 'domain' ? normalizeDomain(value) : normalizeIp(value)
    if (!v) return setError(invalid)
    setError('')
    try {
      await call(dn().addMine(kind, v))
      setValue('')
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <>
      <div className="row">
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
        <button onClick={() => void add()}>Добавить</button>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="list" style={{ marginTop: 8 }}>
        {items.map((d) => (
          <div className="item" key={d}>
            <span className="grow">{d}</span>
            <button className="danger" onClick={() => void call(dn().removeMine(kind, d)).then(onChange)}>
              Удалить
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

export function Lists(): React.JSX.Element {
  const [presets, setPresets] = useState<Preset[]>([])
  const [mine, setMine] = useState<{ domains: string[]; ips: string[] }>({ domains: [], ips: [] })
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    call(dn().presets()).then(setPresets, (e: Error) => setError(e.message))
    call(dn().mine()).then(setMine, (e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const toggle = (p: Preset): void => {
    setPresets((ps) => ps.map((x) => (x.id === p.id ? { ...x, enabled: !p.enabled } : x)))
    call(dn().setPreset(p.id, !p.enabled)).then(load, (e: Error) => {
      setError(e.message)
      load()
    })
  }

  const update = async (): Promise<void> => {
    setUpdating(true)
    setMessage('')
    try {
      const r = await call(dn().updatePresets())
      const names = r.failed.map((id) => presets.find((p) => p.id === id)?.title ?? id)
      setMessage(
        names.length ? `Не удалось обновить: ${names.join(', ')}. Используются прежние списки.` : 'Подборки обновлены.'
      )
      load()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div>
      <div className="section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Подборки — через VPN</h3>
          <button disabled={updating} onClick={() => void update()}>
            {updating ? 'Обновляю…' : 'Обновить'}
          </button>
        </div>
        {message && <div className="small muted" style={{ margin: '6px 0' }}>{message}</div>}
        <div className="list">
          {presets.map((p) => (
            <label className="item" key={p.id}>
              <input type="checkbox" checked={p.enabled} onChange={() => toggle(p)} />
              <div className="grow">
                <div>{p.title}</div>
                <div className="small muted">{sampleText(p) || ' '}</div>
              </div>
              <span className="small muted">{updatedText(p)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>Мои сайты</h3>
        <MineList
          kind="domain"
          items={mine.domains}
          placeholder="Например: youtube.com"
          invalid="Это не похоже на адрес сайта"
          onChange={load}
        />
      </div>

      <details className="section">
        <summary className="small muted" style={{ cursor: 'pointer', marginBottom: 10 }}>
          Дополнительно: IP и подсети
        </summary>
        <MineList
          kind="ip"
          items={mine.ips}
          placeholder="Пример: 1.2.3.4 или 1.2.3.0/24"
          invalid="Это не похоже на IP-адрес или подсеть"
          onChange={load}
        />
      </details>

      {error && <div className="err">{error}</div>}
      <div className="note">
        Если в браузере включён «безопасный DNS» (DNS через HTTPS), сайты из списков на этом устройстве пойдут мимо VPN.
        Отключите его в настройках браузера.
      </div>
    </div>
  )
}
