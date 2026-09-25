import { useState, useCallback, useEffect } from 'react'
import Scanner from './Scanner.jsx'
import Control from './Control.jsx'

const STORAGE_KEY = 'pptRemoteConnection'

export default function App() {
  const [connection, setConnection] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const connect = useCallback(({ serverUrl, token }) => {
    const conn = { serverUrl, token }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conn))
    setConnection(conn)
  }, [])

  // First launch: the phone tapped the QR link, which loaded this page
  // same-origin with ?t=... already in the URL. Auto-connect from that
  // instead of asking the user to scan again inside the app, then strip
  // the token from the visible URL/history.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('t')
    if (token) {
      connect({ serverUrl: window.location.origin, token })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [connect])

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setConnection(null)
  }, [])

  return connection
    ? <Control serverUrl={connection.serverUrl} token={connection.token} onDisconnect={disconnect} />
    : <Scanner onConnect={connect} />
}