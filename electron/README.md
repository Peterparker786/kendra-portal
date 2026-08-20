# Chutki Desktop — Build Instructions

## Kya hai?
Chutki AI Assistant ka desktop version — always-on-top, screen read, auto-fill.

## Build kaise kare?

### Step 1: Dependencies install karo
```bash
cd electron
npm install
```

### Step 2: .exe build karo
```bash
npm run build
```

### Step 3: Output milega
```
electron/dist/Chutki AI Assistant Setup 1.0.0.exe  (installer)
electron/dist/Chutki AI Assistant 1.0.0.exe         (portable)
```

## Portable version (bina install)
```bash
npm run build:portable
```

## Features
- 📌 **Always On Top** — hamesha upar rahega
- 📸 **Screen Capture** — screen padho aur AI se analysis karao
- 📝 **Auto-Fill** — form fields detect karo
- 💬 **AI Chat** — Chutki se pucho
- 📋 **Quick Copy** — customer data ek click me

## Portal URL
Default: `https://kendra-portal.onrender.com`
Custom: `PORTAL_URL=https://your-url.com npm start`

## Requirements
- Windows 10/11 (x64)
- Internet connection (AI features ke liye)
