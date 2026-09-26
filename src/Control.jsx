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
  const [pointerMode, setPointerMode] = useState('touch')
  const [motionEnabled, setMotionEnabled] = useState(false)
  const [motionError, setMotionError] = useState('')
  const [calibration, setCalibration] = useState(null)
  const [motionAxis, setMotionAxis] = useState('both')
  const socketRef = useRef(null)
  const reconnectRef = useRef(null)
  const busyRef = useRef(false)
  const pointerThrottleRef = useRef(0)
  const lastHapticRef = useRef(0)
  const pointerPositionRef = useRef({ x: 0.5, y: 0.5 })
  const smoothMotionRef = useRef({ x: 0.5, y: 0.5 })

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

  function haptic(duration = 20) {
    const now = Date.now()
    if (now - lastHapticRef.current < 120) return
    lastHapticRef.current = now
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(duration)
    }
  }

  function send(action) {
    const socket = socketRef.current
    if (busyRef.current || !socket || socket.readyState !== WebSocket.OPEN || !connected || !desktopOnline) return
    busyRef.current = true
    haptic(20)
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

  function sendPointerPosition(x, y) {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !connected || !desktopOnline) return
    const now = performance.now()
    if (now - pointerThrottleRef.current < 35) return
    pointerThrottleRef.current = now
    const next = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y))
    }
    pointerPositionRef.current = next
    socket.send(JSON.stringify({ type: 'pointer', ...next }))
  }

  async function enableMotionPointer() {
    setMotionError('')
    try {
      const Orientation = window.DeviceOrientationEvent
      if (!Orientation) throw new Error('Motion sensors are not available in this browser.')
      if (typeof Orientation.requestPermission === 'function') {
        const permission = await Orientation.requestPermission()
        if (permission !== 'granted') throw new Error('Motion permission was denied.')
      }
      setCalibration(null)
      setMotionEnabled(true)
      haptic(20)
    } catch (error) {
      setMotionEnabled(false)
      setMotionError(error.message || 'Could not access iPhone motion sensors.')
    }
  }

  function calibrateMotion() {
    setCalibration(null)
    smoothMotionRef.current = { x: 0.5, y: 0.5 }
    haptic(20)
    setTimeout(() => setCalibration({ beta: window.__pptLastBeta || 0, gamma: window.__pptLastGamma || 0 }), 0)
  }

  useEffect(() => {
    if (!motionEnabled || pointerMode !== 'motion') return undefined

    function handleOrientation(event) {
      const beta = Number.isFinite(event.beta) ? event.beta : 0
      const gamma = Number.isFinite(event.gamma) ? event.gamma : 0
      window.__pptLastBeta = beta
      window.__pptLastGamma = gamma
      if (!calibration) return

      const sensitivity = 48
      const deadZone = 2
      const deltaX = Math.abs(gamma - calibration.gamma) < deadZone ? 0 : gamma - calibration.gamma
      const deltaY = Math.abs(beta - calibration.beta) < deadZone ? 0 : beta - calibration.beta
      const target = {
        x: motionAxis === 'vertical' ? 0.5 : Math.max(0, Math.min(1, 0.5 + deltaX / sensitivity)),
        y: motionAxis === 'horizontal' ? 0.5 : Math.max(0, Math.min(1, 0.5 - deltaY / sensitivity))
      }
      const previous = smoothMotionRef.current
      const smoothed = {
        // A lower factor removes hand tremor while retaining deliberate tilts.
        x: previous.x + (target.x - previous.x) * 0.12,
        y: previous.y + (target.y - previous.y) * 0.12
      }
      smoothMotionRef.current = smoothed
      sendPointerPosition(smoothed.x, smoothed.y)
    }

    window.addEventListener('deviceorientation', handleOrientation, true)
    return () => window.removeEventListener('deviceorientation', handleOrientation, true)
  }, [motionEnabled, pointerMode, calibration, motionAxis, connected, desktopOnline])

  function hidePointer() {
    haptic(20)
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
        </div>
      )}

      <div className="utility-row">
        <button className="btn" onPointerDown={() => haptic(20)} onClick={() => send('start')} disabled={!connected || !desktopOnline}><Play size={16} />Start</button>
        <button className="btn btn-danger-text" onPointerDown={() => haptic(20)} onClick={() => send('end')} disabled={!connected || !desktopOnline}><Square size={16} />End</button>
        <button className={`btn ${pointerOpen ? 'btn-primary' : ''}`} onPointerDown={() => haptic(20)} onClick={() => setPointerOpen(true)} disabled={!connected || !desktopOnline} aria-label="Open laser pointer"><Pointer size={18} /></button>
        <button className="btn btn-rescan btn-ghost" onPointerDown={() => haptic(20)} onClick={onDisconnect} aria-label="Scan another presentation"><QrCode size={18} /></button>
      </div>

      <div className="notes-card">
        <div className="notes-label">Speaker Notes</div>
        <div className={`notes-text ${hasNotes ? '' : 'empty'}`}>{hasNotes ? data.notes : data.error ? data.error : 'No notes for this slide.'}</div>
      </div>

      <div className="controls-row">
        <button className="btn btn-lg" onPointerDown={() => haptic(20)} onClick={() => send('prev')} disabled={!connected || !desktopOnline}><ChevronLeft size={20} />Prev</button>
        <button className="btn btn-lg btn-primary" onPointerDown={() => haptic(20)} onClick={() => send('next')} disabled={!connected || !desktopOnline}>Next<ChevronRight size={20} /></button>
      </div>

      <div className="status-bar"><span className="status-dot" />{status}</div>

      {pointerOpen && (
        <div className="pointer-sheet" role="dialog" aria-label="Laser pointer">
          <div className="pointer-sheet-header"><div><strong>Laser pointer</strong><span>{pointerMode === 'motion' ? 'Tilt your iPhone to point' : 'Drag on the pad to point'}</span></div><button className="close-pointer" onClick={hidePointer} aria-label="Close laser pointer"><X size={20} /></button></div>
          <div className="pointer-mode-switch" role="tablist" aria-label="Pointer input mode">
            <button className={pointerMode === 'touch' ? 'active' : ''} onClick={() => { haptic(20); setPointerMode('touch') }}>Touch</button>
            <button className={pointerMode === 'motion' ? 'active' : ''} onClick={() => { haptic(20); setPointerMode('motion') }}>Motion</button>
          </div>
          {pointerMode === 'motion' ? (
            <div className="motion-pointer-panel">
              {!motionEnabled ? <button className="btn btn-lg btn-primary" onClick={enableMotionPointer}>Enable iPhone motion</button> : <button className="btn btn-lg" onClick={calibrateMotion}>Calibrate center</button>}
              {motionEnabled && <div className="axis-selector" role="group" aria-label="Motion axis"><span>Control</span><button className={motionAxis === 'both' ? 'active' : ''} onClick={() => { haptic(20); setMotionAxis('both') }}>Both axes</button><button className={motionAxis === 'horizontal' ? 'active' : ''} onClick={() => { haptic(20); setMotionAxis('horizontal') }}>Horizontal</button><button className={motionAxis === 'vertical' ? 'active' : ''} onClick={() => { haptic(20); setMotionAxis('vertical') }}>Vertical</button></div>}
              {motionEnabled && !calibration && <p>Hold your phone in a comfortable center position, then tap Calibrate.</p>}
              {motionEnabled && calibration && <p>Motion control active. Tilt gently to move the pointer.</p>}
              {motionError && <p className="motion-error">{motionError}</p>}
            </div>
          ) : (
            <div className="pointer-pad" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); haptic(20); sendPointer(event) }} onPointerMove={sendPointer} onPointerUp={sendPointer}></div>
          )}
          <button className="btn btn-lg btn-danger-text pointer-done" onPointerDown={() => haptic(20)} onClick={hidePointer}>Turn off pointer</button>
        </div>
      )}
    </div>
  )
}
