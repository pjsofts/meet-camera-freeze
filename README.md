# Meet Camera Freeze

Freeze your camera in Google Meet with one keystroke — and keep looking alive.

Instead of a suspiciously motionless still, the extension replays **the last 5 seconds
of you** on a loop: you're still breathing, blinking, shifting in your chair. Your mic,
screen share, chat and the rest of the call carry on exactly as before. Hit the key
again and you're live.

```
Alt + Shift + F        →   ❄  looping the last 5 seconds
Alt + Shift + F        →   ●  live
```

---

## Why

Turning your camera off is a statement. Sometimes you just need thirty seconds — to
sneeze, to check on the kid at the door, to stretch, to answer someone off-screen —
without a black tile appearing in the grid and without anyone asking if you're still
there. Freeze holds your presence steady while you step out of frame.

## Features

- **Looks alive** — replays a rolling 5-second clip rather than a frozen photograph
- **Seamless hand-off** — the loop begins with footage that ends at the exact moment
  you froze, so there is no visible jump when it kicks in
- **One keystroke** — `Alt+Shift+F` toggles freeze from anywhere in the Meet tab
- **Three ways to trigger** — hotkey, an on-screen pill in the corner of the meeting,
  or the toolbar popup
- **Still-frame mode** — prefer a plain freeze? One click in the popup
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
| **● Live / ❄ Looping** pill | Top-right corner of the meeting page |
| Toolbar popup | Click the extension icon |

Freezing captures the seconds leading up to that instant and loops them. Unfreezing
resumes the live camera. The toolbar badge shows **❄** whenever a tab is frozen, so you
can never forget you left it on.

Two modes, switchable in the popup:

- **Loop 5s** *(default)* — replays your recent footage; movement, blinking, breathing
- **Still frame** — holds the single frame you froze on; no recording happens at all

Prefer a different shortcut? Set it at `chrome://extensions/shortcuts`.

## How it works

The extension runs a small script in the page's main world at `document_start` —
before any of Meet's own code executes — and wraps `navigator.mediaDevices.getUserMedia`.

When Meet asks for the camera, it gets a canvas capture stream instead of the raw
device track:

```
webcam  →  <video>  →  draw loop  →  <canvas>  →  captureStream()  →  Meet
                            ↑
              live frame    or    looping replay    or    last still
```

Freezing only changes what the draw loop paints. The canvas keeps producing frames at
the camera's own frame rate, so from Meet's point of view — and from WebRTC's — the
track never stops, never stalls and never needs renegotiating. That is why the other
side sees a convincing loop rather than a frozen-then-dropped video tile.

**The rolling buffer.** While you are live, a `MediaRecorder` continuously records the
camera in 5-second segments and keeps only the newest finished one. The moment you
freeze, the in-flight segment is cut short and handed over immediately — so the loop
you start playing is footage that ends at the exact instant you pressed the key, and
the transition is invisible. If that fragment is too short to be useful, the previous
complete segment is used instead; if there is no clip at all yet (you froze within the
first seconds of the call), it falls back to a still frame. Recording pauses entirely
while you are frozen, so the buffer never captures your empty chair.

**Track fidelity.** The wrapper track forwards everything Meet actually inspects —
`label`, `getSettings()`, `getCapabilities()`, `applyConstraints()`, `enabled` and
`stop()` — straight through to the real device track. Camera switching keeps working,
Meet's own camera-off button keeps working, and closing the tab releases the hardware
properly.

### Files

| File | Role |
|---|---|
| `inject.js` | Main-world script: `getUserMedia` wrapper, canvas pipeline, rolling recorder, on-screen pill |
| `bridge.js` | Isolated-world relay between the page and the extension |
| `background.js` | Keyboard command handling and the toolbar badge |
| `popup.html` / `popup.js` | Toolbar popup and mode switch |
| `manifest.json` | Manifest V3 declaration |

Roughly 400 lines of dependency-free JavaScript. No build step, no bundler.

## Troubleshooting

**The pill doesn't appear / the hotkey does nothing.**
Reload the Meet tab. The camera patch has to be installed before Meet requests the
camera, so tabs opened before the extension was loaded aren't covered.

**It held a still instead of looping.**
There was no usable clip yet — you froze within the first few seconds of the call, or
your browser has no `MediaRecorder` support for WebM. Wait a few seconds and try again.

**The loop restart is noticeable.**
Freeze during a quiet moment — the seam is invisible when you start and end in a
similar pose, and obvious mid-gesture.

**The shortcut is taken by something else.**
Reassign it at `chrome://extensions/shortcuts`.

**My camera looks slightly softer than before.**
The feed is re-encoded through a canvas at the camera's negotiated resolution. On most
setups the difference is invisible; if you notice it, lower Meet's send resolution or
raise your camera's.

**CPU use while live.**
Loop mode runs one extra video encode alongside Meet's own. Switch to still-frame mode
in the popup to remove it completely.

## Privacy

The extension has no network permissions and makes no requests. Nothing is uploaded and
nothing is written to disk — the rolling clip lives in memory in your own tab for at
most a few seconds, is overwritten continuously, and is discarded the moment you
unfreeze or close the tab. Host access is limited to `https://meet.google.com/*`.

## Contributing

Issues and pull requests welcome. Edit a file, hit reload on `chrome://extensions`,
reload the Meet tab.

## License

MIT — see [LICENSE](LICENSE).
