import { useState, useCallback } from 'react'
import Scanner from './Scanner.jsx'
import Control from './Control.jsx'

const STORAGE_KEY = 'pptRemoteServer'

export default function App() {
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || '')

  const connect = useCallback((url) => {
    localStorage.setItem(STORAGE_KEY, url)
    setServerUrl(url)
  }, [])

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setServerUrl('')
  }, [])

  return serverUrl
    ? <Control serverUrl={serverUrl} onDisconnect={disconnect} />
    : <Scanner onConnect={connect} />
}