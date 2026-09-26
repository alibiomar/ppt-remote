# PPT Remote — Render relay edition

Control PowerPoint from an iPhone PWA hosted on Vercel, even when the phone and PC are on different Wi-Fi networks.

```text
iPhone PWA on Vercel ── WSS ── Render relay ── WSS ── Windows desktop app ── PowerPoint
```

The Render service is a lightweight authenticated WebSocket relay. It does not access PowerPoint or store presentation content.

## Deploy the relay

1. Push this project to GitHub.
2. In Render, choose **New → Blueprint** and select the repository.
3. Render reads `render.yaml` and deploys the `relay` service.
4. Copy the service URL, such as `https://ppt-remote-relay.onrender.com`.

The relay exposes `/healthz` and WebSocket connections. Its in-memory sessions expire after two hours, so use a single Render instance for this version.

## Configure the Vercel PWA

Deploy `ppt-remote/` to Vercel:

```bash
cd ppt-remote
npm install
npm run build
vercel --prod
```

## Configure the Windows app

```powershell
$env:PPT_RELAY_URL = "wss://ppt-remote-relay.onrender.com"
$env:PPT_PWA_URL = "https://your-pwa.vercel.app"
pip install -r requirements.txt
python app.py
```

The desktop app creates a random session ID and token, connects to Render, and displays a QR code. Scan it with the iPhone. Do not share the QR code: possession of it grants control of that presentation session.

Use the **Open Presentation…** button in the desktop window to choose a `.ppt`, `.pptx`, `.pptm`, `.pps`, or `.ppsx` file. PowerPoint will be launched if needed.

## Relay protocol

Desktop handshake:

```json
{"type":"create","role":"desktop","session":"...","token":"..."}
```

Phone handshake:

```json
{"type":"join","role":"phone","session":"...","token":"..."}
```

Phone command:

```json
{"type":"command","action":"next"}
```

Desktop state update:

```json
{"type":"state","data":{"slide":4,"total":18,"title":"Quarterly Review","notes":"..."}}
```

Supported actions are `next`, `prev`, `start`, and `end`. The relay validates the session token, allows one desktop and one phone, limits payloads to 64 KB, sends ping heartbeats, and expires inactive sessions.
