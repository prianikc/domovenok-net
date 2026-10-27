// «Списки»: подборки сервисов и свои сайты/IP — всё это идёт через VPN.
import { useCallback, useEffect, useState } from 'react'
import type { MineAdded, Preset } from '../../../shared/types'
import { call, dn } from '../lib'

function sampleText(p: Preset): string {
  const more = p.domains + p.subnets - p.sample.length
  return p.sample.join(', ') + (more > 0 ? ` … и ещё ${more}` : '')
}

function updatedText(p: Preset): string {
  return p.updated ? `обновлено ${new Date(p.updated * 1000).toLocaleDateString('ru-RU')}` : 'ещё не скачано'
}

function addedText(r: MineAdded): string {
  const parts = [r.domains && `сайтов: ${r.domains}`, r.ips && `IP и подсетей: ${r.ips}`].filter(Boolean)
  return [
    parts.length ? `Добавлено ${parts.join(', ')}.` : 'Ничего нового не добавлено.',
    r.existed ? `Уже были: ${r.existed}.` : '',
    r.bad.length ? `Не понял: ${r.bad.length} — оставил в поле, поправьте.` : ''
  ]
    .filter(Boolean)
    .join(' ')
}

/** Одно поле на всё: сайты, *.сайты, ссылки, IP и подсети — списком сразу. */
function AddEntries({ onChange }: { onChange: () => void }): React.JSX.Element {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MineAdded | null>(null)
  const [error, setError] = useState('')
  const add = async (): Promise<void> => {
    if (!value.trim() || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const r = await call(dn().addMineList(value))
      setResult(r)
      setValue(r.bad.join('\n'))
      onChange()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <textarea
        rows={5}
        style={{ resize: 'vertical' }}
        value={value}
        placeholder={'Сайты, IP и подсети — по одному в строке или через запятую.\nНапример: *.nexusmods.com, nexus-cdn.com, 104.16.0.0/12'}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && void add()}
      />
      <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
        <button disabled={busy} onClick={() => void add()}>
          {busy ? 'Добавляю…' : 'Добавить'}
        </button>
        <span className="small muted">Ctrl+Enter — тоже добавить</span>
      </div>
      {result && <div className={result.bad.length ? 'err' : 'small muted'}>{addedText(result)}</div>}
      {error && <div className="err">{error}</div>}
    </>
  )
}

function MineItems({
  title,
  kind,
  items,
  onChange
}: {
  title: string
  kind: 'domain' | 'ip'
  items: string[]
  onChange: () => void
}): React.JSX.Element | null {
  if (!items.length) return null
  return (
    <>
      <div className="small muted" style={{ margin: '12px 0 6px' }}>
        {title}: {items.length}
      </div>
      <div className="list">
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
        <h3>Мои сайты и адреса — через VPN</h3>
        <AddEntries onChange={load} />
        <MineItems title="Сайты" kind="domain" items={mine.domains} onChange={load} />
        <MineItems title="IP и подсети" kind="ip" items={mine.ips} onChange={load} />
      </div>

      {error && <div className="err">{error}</div>}
      <div className="note">
        Если в браузере включён «безопасный DNS» (DNS через HTTPS), сайты из списков на этом устройстве пойдут мимо VPN.
        Отключите его в настройках браузера.
      </div>
    </div>
  )
}
