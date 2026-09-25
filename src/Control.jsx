import { useEffect, useState, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Play, Square, QrCode } from 'lucide-react'

export default function Control({ serverUrl, token, onDisconnect }) {
  const [data, setData] = useState({ slide: null, total: null, notes: '', title: 'PPT Remote' })
  const [connected, setConnected] = useState(false)
  const busyRef = useRef(false)

  const withToken = useCallback((path) => {
    const sep = path.includes('?') ? '&' : '?'
    return `${serverUrl}${path}${sep}t=${encodeURIComponent(token)}`
  }, [serverUrl, token])

  const poll = useCallback(async () => {
    try {
      const r = await fetch(withToken('/api/state'))
      if (r.status === 401) { onDisconnect(); return }
      if (!r.ok) throw new Error()
      setData(await r.json())
      setConnected(true)
    } catch {
      setConnected(false)
    }
  }, [withToken, onDisconnect])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 1000)
    return () => clearInterval(id)
  }, [poll])

  async function send(action) {
    if (busyRef.current) return
    busyRef.current = true
    if (navigator.vibrate) navigator.vibrate(8)
    try {
      const r = await fetch(withToken(`/api/${action}`), { method: 'POST' })
      if (r.status === 401) { onDisconnect(); return }
    } finally {
      setTimeout(() => { poll(); busyRef.current = false }, 150)
    }
  }

  const hasNotes = data.notes && data.notes.trim().length > 0

  return (
    <div className={`screen ${connected ? '' : 'offline'}`}>
      <div className="topbar">
        <h1>{data.title || 'PPT Remote'}</h1>
        {data.slide != null && (
          <span className="pill">{data.slide} / {data.total}</span>
        )}
      </div>
      <div className="utility-row">
        <button className="btn" onClick={() => send('start')}>
          <Play size={16} /> Start
        </button>
        <button className="btn btn-danger-text" onClick={() => send('end')}>
          <Square size={16} /> End
        </button>
        <button className="btn btn-rescan btn-ghost" onClick={onDisconnect}>
          <QrCode size={18} />
        </button>
      </div>
      <div className="notes-card">
        <div className="notes-label">Speaker Notes</div>
        <div className={`notes-text ${hasNotes ? '' : 'empty'}`}>
          {hasNotes ? data.notes : 'No notes for this slide.'}
        </div>
      </div>

      <div className="controls-row">
        <button className="btn btn-lg" onClick={() => send('prev')}>
          <ChevronLeft size={20} /> Prev
        </button>
        <button className="btn btn-lg btn-primary" onClick={() => send('next')}>
          Next <ChevronRight size={20} />
        </button>
      </div>



      <div className="status-bar">
        <span className="status-dot" />
        {connected ? 'Connected' : 'Waiting for PowerPoint…'}
      </div>
    </div>
  )
}