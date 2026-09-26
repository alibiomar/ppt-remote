import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Play, Square, QrCode } from 'lucide-react'

function relaySocketUrl(relay) {
  const url = new URL(relay)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  if (url.protocol === 'http:') url.protocol = 'ws:'
  return url.toString()
}

export default function Control({ relay, session, token, onDisconnect }) {
  const [data, setData] = useState({
    slide: null,
    total: null,
    notes: '',
    title: 'PPT Remote',
    error: null
  })

  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('Connecting to relay…')

  const socketRef = useRef(null)
  const reconnectRef = useRef(null)
  const busyRef = useRef(false)

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
        setStatus(`WebSocket error: ${error.message}`)
        if (!cancelled) {
          reconnectRef.current = setTimeout(connectSocket, 2000)
        }
        return
      }

      socket.onopen = () => {
        if (cancelled) return

        setStatus('Connected — joining session…')

        socket.send(JSON.stringify({
          type: 'join',
          role: 'phone',
          session,
          token
        }))
      }

      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data)

          if (message.type === 'ready') {
            setConnected(true)
            setStatus('Connected via Render')
            return
          }

          if (message.type === 'state') {
            // Receiving state proves that the desktop is connected
            // and the relay is successfully forwarding messages.
            setConnected(true)
            setStatus('Connected via Render')

            if (message.data) {
              setData(message.data)
            }
            return
          }

          if (message.type === 'phone_disconnected') {
            setConnected(false)
            setStatus('Desktop disconnected')
          }
        } catch (error) {
          setStatus(`Invalid relay message: ${error.message}`)
        }
      }

      socket.onclose = event => {
        setConnected(false)

        if (cancelled) return

        if (event.code === 1008) {
          setStatus('Session expired or invalid — scan a new QR code')
          onDisconnect()
          return
        }

        setStatus(
          `Relay disconnected (${event.code || 'unknown'}) — reconnecting…`
        )

        reconnectRef.current = setTimeout(connectSocket, 2000)
      }

      socket.onerror = () => {
        setConnected(false)
        setStatus('Cannot connect to Render relay — retrying…')
      }
    }

    connectSocket()

    return () => {
      cancelled = true
      clearTimeout(reconnectRef.current)

      try {
        socket?.close()
      } catch {}

      socketRef.current = null
    }
  }, [relay, session, token, onDisconnect])

  function send(action) {
    const socket = socketRef.current

    if (
      busyRef.current ||
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !connected
    ) {
      return
    }

    busyRef.current = true

    if (navigator.vibrate) {
      navigator.vibrate(8)
    }

    socket.send(JSON.stringify({
      type: 'command',
      action
    }))

    setTimeout(() => {
      busyRef.current = false
    }, 150)
  }

  const hasNotes =
    typeof data.notes === 'string' &&
    data.notes.trim().length > 0

  return (
    <div className={`screen ${connected ? '' : 'offline'}`}>
      <div className="topbar">
        <h1>{data.title || 'PPT Remote'}</h1>

        {data.slide != null && (
          <span className="pill">
            {data.slide} / {data.total}
          </span>
        )}
      </div>

      <div className="utility-row">
        <button
          className="btn"
          onClick={() => send('start')}
          disabled={!connected}
        >
          <Play size={16} />
          Start
        </button>

        <button
          className="btn btn-danger-text"
          onClick={() => send('end')}
          disabled={!connected}
        >
          <Square size={16} />
          End
        </button>

        <button
          className="btn btn-rescan btn-ghost"
          onClick={onDisconnect}
        >
          <QrCode size={18} />
        </button>
      </div>

      <div className="notes-card">
        <div className="notes-label">Speaker Notes</div>

        <div className={`notes-text ${hasNotes ? '' : 'empty'}`}>
          {hasNotes
            ? data.notes
            : data.error
              ? data.error
              : 'No notes for this slide.'}
        </div>
      </div>

      <div className="controls-row">
        <button
          className="btn btn-lg"
          onClick={() => send('prev')}
          disabled={!connected}
        >
          <ChevronLeft size={20} />
          Prev
        </button>

        <button
          className="btn btn-lg btn-primary"
          onClick={() => send('next')}
          disabled={!connected}
        >
          Next
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="status-bar">
        <span className="status-dot" />
        {status}
      </div>
    </div>
  )
}
