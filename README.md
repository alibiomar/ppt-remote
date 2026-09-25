# PPT Remote

Control a PowerPoint presentation from your phone. Scan a QR code to
connect, flip slides, and read speaker notes live — no cables, no
PowerPoint Presenter View needed.

## How it works

```
┌─────────────┐        HTTPS/QR         ┌──────────────────┐        COM        ┌─────────────┐
│  Phone (PWA) │ ───────────────────────▶│  Desktop app (PC) │ ─────────────────▶│  PowerPoint  │
│  React app   │◀─────────────────────── │  Flask + cheroot  │◀────────────────── │              │
└─────────────┘      next/prev/state     └──────────────────┘                   └─────────────┘
```

- **`ppt-remote-desktop/`** — Windows desktop app. Shows a QR code,
  runs a local HTTPS server, drives PowerPoint via COM automation.
- **`ppt-remote-react/`** — Phone-side PWA (React + Vite). Opens
  straight into a camera scanner; scan the desktop app's QR to connect.

## Quick start

**On the PC:**
```bash
cd ppt-remote-desktop
pip install flask cheroot cryptography qrcode[pil] pywin32 pillow
python app.py
```
Open your presentation in PowerPoint first. A window appears with a
QR code and an HTTPS URL.

**On the phone:**
```bash
cd ppt-remote-react
npm install
npm run build
vercel --prod   # or serve dist/ any static host
```
Open the deployed URL on your phone. The scanner opens automatically.

**One-time per phone:** the desktop app uses a self-signed cert.
Visit its URL directly in the phone browser once and accept the
"not secure" warning — otherwise the scan connects but requests fail
silently.

## Features
- QR-based pairing, no manual IP typing
- Live speaker notes, polled every second
- Next / Prev / Start / End show controls
- Installable as a PWA (Add to Home Screen)
- iOS-style UI with light/dark mode
- Production WSGI server (cheroot) on the desktop side

## Build a standalone .exe
```bash
cd ppt-remote-desktop
pip install pyinstaller
pyinstaller --onefile --noconsole --name "PPT Remote" app.py
```

## Requirements
- Windows + PowerPoint (desktop COM automation)
- Phone and PC on the same WiFi/LAN
- Node.js 18+ for the React app

## Project structure
```
.
├── ppt-remote-desktop/   # Windows GUI + control server
│   ├── app.py
│   └── README.md
└── ppt-remote-react/     # Phone PWA
    ├── src/
    ├── public/
    └── README.md
```

## License
MIT