import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Play, Square, QrCode, Pointer, X } from 'lucide-react'

function relaySocketUrl(relay) {
  const url = new URL(relay)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  if (url.protocol === 'http:') url.protocol = 'ws:'
  return url.toString()
}

export default function Control({ relay, session, token, onDisconnect }) {
  const [data, setData] = useState({ slide: null, total: null, notes: '', title: 'PPT Remote', error: null })
  const [connected, setConnected] = useState(false)
  const [desktopOnline, setDesktopOnline] = useState(false)
  const [status, setStatus] = useState('Connecting to relay…')
  const [pointerOpen, setPointerOpen] = useState(false)
  const socketRef = useRef(null)
  const reconnectRef = useRef(null)
  const busyRef = useRef(false)
  const pointerThrottleRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    let socket

    function connectSocket() {
      if (cancelled) return
      setStatus('Connecting to relay…')
      try {
        socket = new WebSocket(relaySocketUrl(relay))
        socketRef.current = socket
      } catch (error) {
        setConnected(false)
        setDesktopOnline(false)
        setStatus(`WebSocket error: ${error.message}`)
        reconnectRef.current = setTimeout(connectSocket, 2000)
        return
      }

      socket.onopen = () => {
        if (cancelled) return
        setStatus('Connected — joining session…')
        socket.send(JSON.stringify({ type: 'join', role: 'phone', session, token }))
      }

      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'ready') {
            setConnected(true)
            setStatus('Connected via Render')
            return
          }
          if (message.type === 'desktop_online') {
            setDesktopOnline(true)
            setStatus('Connected via Render')
            return
          }
          if (message.type === 'desktop_disconnected') {
            setDesktopOnline(false)
            setStatus('PC disconnected — waiting for it to reconnect')
            return
          }
          if (message.type === 'state') {
            setConnected(true)
            setDesktopOnline(true)
            setStatus('Connected via Render')
            if (message.data) setData(message.data)
            return
          }
        } catch (error) {
          setStatus(`Invalid relay message: ${error.message}`)
        }
      }

      socket.onclose = event => {
        setConnected(false)
        setDesktopOnline(false)
        if (cancelled) return
        if (event.code === 1008) {
          setStatus('Session expired or invalid — scan a new QR code')
          onDisconnect()
          return
        }
        setStatus(`Relay disconnected (${event.code || 'unknown'}) — reconnecting…`)
        reconnectRef.current = setTimeout(connectSocket, 2000)
      }

      socket.onerror = () => {
        setConnected(false)
        setDesktopOnline(false)
        setStatus('Cannot connect to Render relay — retrying…')
      }
    }

    connectSocket()
    return () => {
      cancelled = true
      clearTimeout(reconnectRef.current)
      try { socket?.close() } catch {}
      socketRef.current = null
    }
  }, [relay, session, token, onDisconnect])

  function haptic(duration = 8) {
    if (navigator.vibrate) navigator.vibrate(duration)
  }

  function send(action) {
    const socket = socketRef.current
    if (busyRef.current || !socket || socket.readyState !== WebSocket.OPEN || !connected || !desktopOnline) return
    busyRef.current = true
    haptic()
    socket.send(JSON.stringify({ type: 'command', action }))
    setTimeout(() => { busyRef.current = false }, 150)
  }

  function sendPointer(event) {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !connected || !desktopOnline) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    const now = performance.now()
    if (now - pointerThrottleRef.current < 35) return
    pointerThrottleRef.current = now
    socket.send(JSON.stringify({ type: 'pointer', x, y }))
  }

  function hidePointer() {
    haptic()
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN && connected && desktopOnline) {
      socket.send(JSON.stringify({ type: 'command', action: 'laser_off' }))
    }
    setPointerOpen(false)
  }

  const hasNotes = typeof data.notes === 'string' && data.notes.trim().length > 0
  const slide = Number(data.slide)
  const total = Number(data.total)
  const progress = Number.isFinite(slide) && Number.isFinite(total) && total > 0 ? Math.min(100, Math.max(0, (slide / total) * 100)) : 0
  const dotCount = Number.isFinite(total) ? Math.min(total, 18) : 0

  return (
    <div className={`screen ${connected && desktopOnline ? '' : 'offline'}`}>
      {!desktopOnline && connected && (
        <div className="offline-banner" role="status">
          <span className="offline-banner-dot" />
          <span><strong>PC disconnected</strong><small>Your presentation is safe. Reconnect the desktop to continue.</small></span>
        </div>
      )}

      <div className="topbar">
        <h1>{data.title || 'PPT Remote'}</h1>
        {data.slide != null && <span className="pill">{data.slide} / {data.total}</span>}
      </div>

      {data.slide != null && data.total != null && (
        <div className="progress-panel" aria-label={`Slide ${data.slide} of ${data.total}`}>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          {dotCount > 0 && (
            <div className="progress-dots" aria-hidden="true">
              {Array.from({ length: dotCount }, (_, index) => <i key={index} className={index + 1 === slide ? 'active' : index + 1 < slide ? 'passed' : ''} />)}
            </div>
          )}
        </div>
      )}

      <div className="utility-row">
        <button className="btn" onClick={() => send('start')} disabled={!connected || !desktopOnline}><Play size={16} />Start</button>
        <button className="btn btn-danger-text" onClick={() => send('end')} disabled={!connected || !desktopOnline}><Square size={16} />End</button>
        <button className={`btn ${pointerOpen ? 'btn-primary' : ''}`} onClick={() => { haptic(); setPointerOpen(true) }} disabled={!connected || !desktopOnline} aria-label="Open laser pointer"><Pointer size={18} /></button>
        <button className="btn btn-rescan btn-ghost" onClick={onDisconnect} aria-label="Scan another presentation"><QrCode size={18} /></button>
      </div>

      <div className="notes-card">
        <div className="notes-label">Speaker Notes</div>
        <div className={`notes-text ${hasNotes ? '' : 'empty'}`}>{hasNotes ? data.notes : data.error ? data.error : 'No notes for this slide.'}</div>
      </div>

      <div className="controls-row">
        <button className="btn btn-lg" onClick={() => send('prev')} disabled={!connected || !desktopOnline}><ChevronLeft size={20} />Prev</button>
        <button className="btn btn-lg btn-primary" onClick={() => send('next')} disabled={!connected || !desktopOnline}>Next<ChevronRight size={20} /></button>
      </div>

      <div className="status-bar"><span className="status-dot" />{status}</div>

      {pointerOpen && (
        <div className="pointer-sheet" role="dialog" aria-label="Laser pointer">
          <div className="pointer-sheet-header"><div><strong>Laser pointer</strong><span>Drag on the pad to point on the slide</span></div><button className="close-pointer" onClick={hidePointer} aria-label="Close laser pointer"><X size={20} /></button></div>
          <div className="pointer-pad" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); haptic(5); sendPointer(event) }} onPointerMove={sendPointer} onPointerUp={sendPointer}><div className="pointer-crosshair" /></div>
          <button className="btn btn-lg btn-danger-text pointer-done" onClick={hidePointer}>Turn off pointer</button>
        </div>
      )}
    </div>
  )
}
