# Meet Camera Freeze

Freeze your webcam on a still frame in Google Meet — instantly, with one keystroke.

Everyone else keeps seeing the frame you froze on. Your mic, screen share, chat and
the rest of the call carry on exactly as before. Hit the key again and you're live.

```
Alt + Shift + F        →   ❄  frozen
Alt + Shift + F        →   ●  live
```

---

## Why

Turning your camera off is a statement. Sometimes you just need thirty seconds — to
sneeze, to check on the kid at the door, to stretch, to answer someone off-screen —
without a black tile appearing in the grid and without anyone asking if you're still
there. Freeze holds your presence steady while you step out of frame.

## Features

- **One keystroke** — `Alt+Shift+F` toggles freeze from anywhere in the Meet tab
- **Three ways to trigger** — hotkey, an on-screen pill in the corner of the meeting,
  or the toolbar popup
- **Invisible to the call** — the video track stays live at full frame rate, so there
  is no reconnect, no "camera off" tile, no dropped stream on the other end
- **Everything else keeps working** — device switching, Meet's own camera on/off
  button, screen sharing, backgrounds and effects behave as usual
- **Zero network access** — no accounts, no servers, no telemetry, no analytics
- **Scoped to Meet** — the extension only touches `meet.google.com` and nothing else

## Install

Not on the Chrome Web Store — load it directly, it takes about twenty seconds.

1. Download or clone this repository
   ```bash
   git clone https://github.com/pjsofts/meet-camera-freeze.git
   ```
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top-right toggle)
4. Click **Load unpacked** and pick the `meet-camera-freeze` folder
5. Reload any Google Meet tab that was already open

Works in Chrome, Edge, Brave, Arc and other Chromium browsers with Manifest V3.

## Use

| Trigger | Where |
|---|---|
| `Alt+Shift+F` | Anywhere in the Meet tab |
| **● Live / ❄ Frozen** pill | Top-right corner of the meeting page |
| Toolbar popup | Click the extension icon |

Freezing captures the frame showing at that exact instant and keeps sending it.
Unfreezing resumes the live camera. The toolbar badge shows **❄** whenever a tab is
frozen, so you can never forget you left it on.

Prefer a different shortcut? Set it at `chrome://extensions/shortcuts`.

## How it works

The extension runs a small script in the page's main world at `document_start` —
before any of Meet's own code executes — and wraps `navigator.mediaDevices.getUserMedia`.

When Meet asks for the camera, it gets a canvas capture stream instead of the raw
device track:

```
webcam  →  <video>  →  draw loop  →  <canvas>  →  captureStream()  →  Meet
                            ↑
                    live frame  or  last snapshot
```

Freezing only changes what the draw loop paints. The canvas keeps producing frames at
the camera's own frame rate, so from Meet's point of view — and from WebRTC's — the
track never stops, never stalls and never needs renegotiating. That is why the other
side sees a still image rather than a frozen-then-dropped video tile.

The wrapper track forwards everything Meet actually inspects — `label`,
`getSettings()`, `getCapabilities()`, `applyConstraints()`, `enabled` and `stop()` —
straight through to the real device track. Camera switching keeps working, Meet's own
camera-off button keeps working, and closing the tab releases the hardware properly.

### Files

| File | Role |
|---|---|
| `inject.js` | Main-world script: `getUserMedia` wrapper, canvas pipeline, on-screen pill |
| `bridge.js` | Isolated-world relay between the page and the extension |
| `background.js` | Keyboard command handling and the toolbar badge |
| `popup.html` / `popup.js` | Toolbar popup |
| `manifest.json` | Manifest V3 declaration |

## Troubleshooting

**The pill doesn't appear / the hotkey does nothing.**
Reload the Meet tab. The camera patch has to be installed before Meet requests the
camera, so tabs opened before the extension was loaded aren't covered.

**The shortcut is taken by something else.**
Reassign it at `chrome://extensions/shortcuts`.

**The popup says "Reload the Meet tab".**
Same cause — the tab predates the extension. One reload fixes it.

**My camera looks slightly softer than before.**
The feed is re-encoded through a canvas at the camera's negotiated resolution. On most
setups the difference is invisible; if you notice it, lower Meet's send resolution or
raise your camera's.

## Privacy

The extension has no network permissions and makes no requests. Nothing is recorded,
uploaded or stored — the frozen frame lives only in a canvas in your own tab and is
discarded when you unfreeze or close the tab. Host access is limited to
`https://meet.google.com/*`.

## Contributing

Issues and pull requests welcome. The whole thing is a few hundred lines of dependency-free
JavaScript — no build step, no bundler. Edit a file, hit reload on `chrome://extensions`,
reload the Meet tab.

## License

MIT — see [LICENSE](LICENSE).
