import { useState, useCallback, useEffect } from 'react'
import Scanner from './Scanner.jsx'
import Control from './Control.jsx'

const STORAGE_KEY = 'pptRemoteRenderSession'

export default function App() {
  const [connection, setConnection] = useState(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
  })
  const connect = useCallback(({ relay, session, token }) => {
    const next = { relay, session, token }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setConnection(next)
  }, [])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const relay = params.get('relay'); const session = params.get('session'); const token = params.get('token')
    if (relay && session && token) { connect({ relay, session, token }); window.history.replaceState({}, '', window.location.pathname) }
  }, [connect])
  const disconnect = useCallback(() => { localStorage.removeItem(STORAGE_KEY); setConnection(null) }, [])
  return connection ? <Control {...connection} onDisconnect={disconnect} /> : <Scanner onConnect={connect} />
}
