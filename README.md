# Soundboard

A touch-friendly, mobile- *and* desktop-friendly soundboard built as a static
PWA. No frameworks, no build step, no server-side code. Drop audio files into
`Sounds/`, regenerate the manifest, and you're done. Easy to wrap as an APK
later (see [APK conversion](#turning-it-into-an-apk)).

## Features

- 📱 Big, touchable buttons that adapt from phone screens up to 4K monitors
- 🔊 Tap to play; multi-tap overlaps; **Stop** button or **Esc** kills all
- 🗂 Auto-grouped by filename prefix (`Person-Name.mp3` → group **Person**)
- 🔎 Live filter box + per-group chips
- 🌓 Light / dark theme toggle (remembered)
- 📦 Installable as a PWA (Chrome/Edge "Install app" / iOS "Add to Home
  Screen") with offline support — sound files are cached on first play
- 🚫 Zero dependencies; everything is plain HTML/CSS/JS

## Folder layout

```
Sound_Board/
├── index.html                 ← entry point
├── styles.css
├── app.js
├── service-worker.js          ← offline cache
├── manifest.webmanifest       ← PWA install metadata
├── build_manifest.py          ← rebuilds sounds.json
├── sounds.json                ← generated; lists files in Sounds/
├── Sounds/                    ← drop your audio here
│   ├── Effect-Air_Horn.mp3
│   ├── Effect-Big_Bang.mp3
│   ├── Steve-Hello.mp3
│   └── Steve-Goodbye.mp3
└── icons/
    ├── icon-192.png           ← supply your own (192×192)
    └── icon-512.png           ← supply your own (512×512)
```

## Naming convention

Files use one of these patterns:

```
Person-Sound_Name.mp3      → group "Person",  label "Sound Name"
Effect-Name_Of_Effect.mp3  → group "Effect",  label "Name Of Effect"
SomeFile.mp3               → group "Misc",    label "SomeFile"
```

Underscores become spaces in the displayed label. Anything before the first
`-` is the group; anything after is the label.

Supported extensions: `.mp3`, `.wav`, `.ogg`, `.oga`, `.m4a`, `.aac`,
`.opus`, `.flac`, `.webm`.

## Quick start

1. **Add audio.** Drop files into `Sounds/` using the naming convention
   above.

2. **Generate the manifest** (whenever files change):

   ```pwsh
   python build_manifest.py
   ```

3. **Run a tiny local server** (browsers block `fetch()` on `file://`):

   ```pwsh
   python -m http.server 8000
   ```

   Then open <http://localhost:8000/>.

4. **Install on phone / desktop** (optional). Chrome/Edge will offer
   "Install app"; on iOS use Safari → Share → "Add to Home Screen".

## Icons

Replace `icons/icon-192.png` and `icons/icon-512.png` with whatever you like
(square PNG, opaque background recommended for maskable icons).

## Hosting

Anywhere that serves static files works:

- GitHub Pages
- Netlify / Vercel / Cloudflare Pages
- Any web host with a folder
- An Android APK wrapper (next section)

## Turning it into an APK

You don't have to rebuild any code — the same files become an Android app.
Pick whichever workflow suits you:

### Option 1 — PWABuilder (easiest, no toolchain)

1. Host the site somewhere with HTTPS (GitHub Pages is fine).
2. Visit <https://www.pwabuilder.com/> and paste your URL.
3. Click **Package for Stores → Android → Generate**. You'll get a
   signed `.apk` / `.aab` plus install instructions.

### Option 2 — Capacitor (more control, native shell)

```pwsh
# One-time setup
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init Soundboard com.example.soundboard --web-dir=.

# Build the Android project
npx cap add android
npx cap copy
npx cap open android   # opens Android Studio; build the APK from there
```

Whenever you change web files: `npx cap copy` and rebuild.

### Option 3 — Bubblewrap (CLI-only TWA)

```pwsh
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://your-host/manifest.webmanifest
bubblewrap build
```

## Development tips

- The board re-reads `sounds.json` on every page load, so just refresh the
  browser after running `build_manifest.py`.
- The service worker keeps the **last** copy of `sounds.json` cached but
  prefers the network — new sounds appear with a normal refresh, no
  un-install needed.
- ESC stops everything from anywhere outside the search box.
- Long sound files keep playing across taps; hit **Stop** or ESC to clear.

## Why a manifest file?

Browsers can't list a directory over HTTP for security reasons. The tiny
`sounds.json` is the workaround. If you'd rather not run Python you can
write the file by hand — its shape is just `{"files": ["a.mp3","b.mp3"]}`.
