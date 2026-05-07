# Icons

Place app icons here before the first `npm run tauri:build`.

The Tauri config expects:
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)

Quickest path: drop a single 1024×1024 PNG named `icon.png` here and run:

```bash
npx @tauri-apps/cli icon ./src-tauri/icons/icon.png
```

That generates the rest.
