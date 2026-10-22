// Большое окно: навигация и разделы. Хеш #mini — мини-окно над треем.
import { useEffect, useState } from 'react'
import type { PairingState } from '../../shared/ipc'
import { Mini } from './mini'
import { call, dn, useLive } from './lib'
import { Lists } from './pages/Lists'
import { Migration } from './pages/Migration'
import { Overview } from './pages/Overview'
import { Pairing } from './pages/Pairing'
import { Profiles } from './pages/Profiles'
import { Router } from './pages/Router'
import { Server } from './pages/Server'

type Tab = 'overview' | 'lists' | 'profiles' | 'router' | 'server' | 'migration'

const NAV: [Tab, string][] = [
  ['overview', 'Обзор'],
  ['lists', 'Списки'],
  ['profiles', 'Профили'],
  ['router', 'Роутер'],
  ['server', 'Сервер']
]

function Main(): React.JSX.Element {
  const live = useLive()
  const [tab, setTab] = useState<Tab>('overview')
  const [pairing, setPairing] = useState<PairingState | null>(null)
  useEffect(() => {
    void call(dn().pairingState()).then(setPairing)
    const offs = [
      dn().onNavigate((t) => setTab(t as Tab)),
      dn().onPairing((p) => {
        setPairing(p)
        if (p.step === 'done') setTab(p.legacy ? 'migration' : 'overview')
      })
    ]
    return () => offs.forEach((off) => off())
  }, [])

  const paired = pairing?.step === 'done'
  return (
    <>
      <div className="nav">
        <b>ДомовёнокNET</b>
        {paired &&
          NAV.map(([id, label]) => (
            <a key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </a>
          ))}
      </div>
      <div className="page">
        {pairing && !paired && <Pairing state={pairing} />}
        {paired && tab === 'overview' && <Overview live={live} onCheck={() => setTab('router')} />}
        {paired && tab === 'lists' && <Lists />}
        {paired && tab === 'profiles' && <Profiles />}
        {paired && tab === 'router' && <Router onMigrate={() => setTab('migration')} />}
        {paired && tab === 'server' && <Server />}
        {paired && tab === 'migration' && <Migration onDone={() => setTab('overview')} />}
      </div>
    </>
  )
}

export default function App(): React.JSX.Element {
  return window.location.hash === '#mini' ? <Mini /> : <Main />
}
