import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { ScanLine, MonitorPlay } from 'lucide-react'

export default function Scanner({ onConnect }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(document.createElement('canvas'))
  const rafRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        videoRef.current.srcObject = stream
        loop()
      } catch {
        setStatus('Camera unavailable — enter the address below.')
      }
    }

    function loop() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imgData.data, imgData.width, imgData.height)
        if (code?.data?.startsWith('http')) {
          stop()
          tryConnect(code.data.trim())
          return
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }

    start()
    return () => { cancelled = true; stop() }
  }, [])

  async function tryConnect(raw) {
    let serverUrl, token
    try {
      const parsed = new URL(raw.trim())
      token = parsed.searchParams.get('t')
      parsed.search = ''
      serverUrl = parsed.toString().replace(/\/$/, '')
    } catch {
      setStatus('That QR code doesn\'t look like a PPT Remote link.')
      return
    }
    if (!token) {
      setStatus('This link is missing its access code — rescan the current QR on the PC.')
      return
    }

    setConnecting(true)
    setStatus('Connecting…')
    try {
      const r = await fetch(`${serverUrl}/api/ping?t=${encodeURIComponent(token)}`)
      if (r.status === 401) {
        setConnecting(false)
        setStatus('This code has expired — the PC app was restarted. Scan the current QR code shown on it.')
        return
      }
      if (!r.ok) throw new Error()
      if (navigator.vibrate) navigator.vibrate(15)
      onConnect({ serverUrl, token })
    } catch {
      setConnecting(false)
      setStatus('Could not reach server — check you\'re on the same WiFi as the PC.')
    }
  }

  return (
    <div className="screen">
      <div className="hero">
        <div className="hero-icon"><MonitorPlay size={26} /></div>
        <h1>PPT Remote</h1>
        <p>Scan the QR shown on your PC</p>
      </div>

      <div className="scanner-frame">
        <video ref={videoRef} playsInline autoPlay muted />
        <div className="scan-reticle" />
      </div>

      <div className="scan-caption">
        {connecting ? status : (status || (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ScanLine size={14} /> Point camera at the QR code
          </span>
        ))}
      </div>

      <div className="manual-entry">
        <input
          placeholder="http://192.168.x.x:5000/?t=..."
          value={manualUrl}
          onChange={e => setManualUrl(e.target.value)}
        />
        <button onClick={() => manualUrl.trim() && tryConnect(manualUrl.trim())}>
          Connect
        </button>
      </div>
      <div className="scan-caption" style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
        Paste the full link shown under the QR on the PC — it includes the access code.
      </div>
    </div>
  )
}