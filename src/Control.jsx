import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Play, Square, QrCode } from 'lucide-react'

function relaySocketUrl(relay) {
  const url = new URL(relay); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; return url.toString()
}

export default function Control({ relay, session, token, onDisconnect }) {
  const [data, setData] = useState({ slide: null, total: null, notes: '', title: 'PPT Remote' })
  const [connected, setConnected] = useState(false)
  const socketRef = useRef(null); const reconnectRef = useRef(null); const busyRef = useRef(false)

  useEffect(() => {
    let cancelled = false; let socket
    function connectSocket() {
      if (cancelled) return
      socket = new WebSocket(relaySocketUrl(relay)); socketRef.current = socket
      socket.onopen = () => socket.send(JSON.stringify({ type: 'join', role: 'phone', session, token }))
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'ready') setConnected(true)
          if (message.type === 'state') setData(message.data)
        } catch {}
      }
      socket.onclose = event => {
        setConnected(false)
        if (event.code === 1008) onDisconnect()
        else if (!cancelled) reconnectRef.current = setTimeout(connectSocket, 2000)
      }
      socket.onerror = () => setConnected(false)
    }
    connectSocket()
    return () => { cancelled = true; clearTimeout(reconnectRef.current); socket?.close(); socketRef.current = null }
  }, [relay, session, token, onDisconnect])

  function send(action) {
    if (busyRef.current || socketRef.current?.readyState !== WebSocket.OPEN || !connected) return
    busyRef.current = true; if (navigator.vibrate) navigator.vibrate(8)
    socketRef.current.send(JSON.stringify({ type: 'command', action }))
    setTimeout(() => { busyRef.current = false }, 150)
  }
  const hasNotes = data.notes && data.notes.trim().length > 0
  return <div className={`screen ${connected ? '' : 'offline'}`}>
    <div className="topbar"><h1>{data.title || 'PPT Remote'}</h1>{data.slide != null && <span className="pill">{data.slide} / {data.total}</span>}</div>
    <div className="utility-row"><button className="btn" onClick={() => send('start')}><Play size={16} /> Start</button><button className="btn btn-danger-text" onClick={() => send('end')}><Square size={16} /> End</button><button className="btn btn-rescan btn-ghost" onClick={onDisconnect}><QrCode size={18} /></button></div>
    <div className="notes-card"><div className="notes-label">Speaker Notes</div><div className={`notes-text ${hasNotes ? '' : 'empty'}`}>{hasNotes ? data.notes : 'No notes for this slide.'}</div></div>
    <div className="controls-row"><button className="btn btn-lg" onClick={() => send('prev')}><ChevronLeft size={20} /> Prev</button><button className="btn btn-lg btn-primary" onClick={() => send('next')}>Next <ChevronRight size={20} /></button></div>
    <div className="status-bar"><span className="status-dot" />{connected ? 'Connected via Render' : 'Reconnecting to presentation…'}</div>
  </div>
}
