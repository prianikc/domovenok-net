// Перенос старой настройки (VPN Tray 1.0) с резервной копией и откатом.
import { useState } from 'react'
import type { MigrationResult } from '../../../shared/ipc'
import type { MigrationPlan } from '../../../shared/migration-plan'
import { STATE_LABEL, call, dn } from '../lib'

export function Migration({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [plan, setPlan] = useState<MigrationPlan | null>(null)
  const [result, setResult] = useState<MigrationResult | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const step = async (label: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(label)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  if (result) {
    return (
      <div className="center" style={{ maxWidth: 460, margin: '40px auto', gap: 12 }}>
        {result.healthy ? (
          <>
            <h2 style={{ margin: 0, fontWeight: 400 }}>Готово</h2>
            <div className="muted">Настройки перенесены, VPN работает.</div>
            <button className="primary" onClick={onDone}>Открыть обзор</button>
          </>
        ) : (
          <>
            <h2 style={{ margin: 0, fontWeight: 400 }}>VPN пока не поднялся</h2>
            <div className="muted">Интернет напрямую: {result.directInternet ? 'есть' : 'нет'}.</div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button
                className="danger"
                disabled={!!busy}
                onClick={() => void step('rollback', async () => {
                  await call(dn().migrationRollback())
                  setResult(null)
                  setPlan(null)
                })}
              >
                {busy === 'rollback' ? 'Откатываю…' : 'Откатить'}
              </button>
              <button onClick={onDone}>Оставить и проверить</button>
            </div>
          </>
        )}
        <div className="small muted">Резервная копия: {result.backupPath}</div>
        {error && <div className="err">{error}</div>}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <h2 style={{ fontWeight: 400 }}>Перенос старой настройки</h2>
      <div className="muted" style={{ marginBottom: 16 }}>
        На роутере найдена настройка старой программы VPN Tray. ДомовёнокNET перенесёт профили и сайты, а перед этим сохранит
        резервную копию на этот компьютер — всё можно будет вернуть.
      </div>
      {!plan ? (
        <button className="primary" disabled={!!busy} onClick={() => void step('plan', async () => setPlan(await call(dn().migrationPlan())))}>
          {busy ? 'Смотрю, что есть на роутере…' : 'Подготовить перенос'}
        </button>
      ) : (
        <>
          <div className="section">
            <h3>Будет перенесено</h3>
            <div className="list">
              <div className="item">Профили: {plan.profiles.map((p) => p.name).join(', ') || 'нет'}</div>
              <div className="item">Подборки: {plan.presetsOn.join(', ') || 'нет'}</div>
              <div className="item">Мои сайты: {plan.mineDomains.length}</div>
              <div className="item">Мои IP: {plan.mineIps.length}</div>
              <div className="item">Режим: {STATE_LABEL[plan.state]}</div>
            </div>
          </div>
          <div className="section">
            <h3>Будет удалено</h3>
            <div className="list">
              {[...plan.removed, ...(plan.skippedProfiles.length ? [`Профили, которые не переносятся: ${plan.skippedProfiles.join(', ')}`] : [])].map((r) => (
                <div className="item small muted" key={r}>{r}</div>
              ))}
            </div>
          </div>
          <button
            className="primary"
            disabled={!!busy}
            onClick={() => void step('commit', async () => setResult(await call(dn().migrationCommit())))}
          >
            {busy === 'commit' ? 'Переношу… (до минуты)' : 'Перенести'}
          </button>
        </>
      )}
      {error && <div className="err">{error}</div>}
    </div>
  )
}
