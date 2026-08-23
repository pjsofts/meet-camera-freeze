/*
 * Runs in the page's MAIN world at document_start, before Meet's own scripts.
 * It wraps navigator.mediaDevices.getUserMedia so every camera track Meet
 * receives is actually a canvas capture of the real camera.
 *
 * While "frozen" the canvas replays a loop of the last minute of you (falling
 * back to a single still frame if no clip is available yet), so the track stays
 * live at full frame rate and the call is undisturbed.
 */
(() => {
  if (window.__mcfInstalled) return;
  window.__mcfInstalled = true;

  const LOOP_SECONDS = 60;
  const SEGMENT_MS = LOOP_SECONDS * 1000;
  const MIN_CLIP_MS = 1500;                    // shorter than this and a replay looks like a stutter
  const PREFER_FRESH_MS = SEGMENT_MS / 2;      // below this, an older but full-length clip wins

  const REC_MIME = (window.MediaRecorder && [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ].find((m) => MediaRecorder.isTypeSupported(m))) || null;

  const state = { frozen: false, mode: 'loop', looping: false };
  const pipes = new Set();

  function broadcast() {
    window.dispatchEvent(new CustomEvent('MCF_STATE', {
      detail: { frozen: state.frozen, mode: state.mode, looping: state.looping }
    }));
    paintButton();
  }

  function setFrozen(next) {
    next = !!next;
    if (next !== state.frozen) {
      state.frozen = next;
      state.looping = false;
      for (const pipe of pipes) pipe.onFreezeChange();
    }
    broadcast();
  }

  function setMode(mode) {
    if (mode !== 'loop' && mode !== 'still') return;
    if (mode !== state.mode) {
      state.mode = mode;
      for (const pipe of pipes) pipe.onModeChange();
    }
    broadcast();
  }

  /* ---------- camera pipeline ---------- */

  function makePipe(sourceTrack) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([sourceTrack]);
    const playing = video.play();
    if (playing && playing.catch) playing.catch(() => {});

    const settings = sourceTrack.getSettings ? sourceTrack.getSettings() : {};
    const canvas = document.createElement('canvas');
    canvas.width = settings.width || 1280;
    canvas.height = settings.height || 720;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // The still we repaint while frozen with no clip to loop.
    const still = document.createElement('canvas');
    const stillCtx = still.getContext('2d', { alpha: false });

    const fps = Math.min(60, Math.max(1, Math.round(settings.frameRate || 30)));
    const outStream = canvas.captureStream(fps);
    const outTrack = outStream.getVideoTracks()[0];

    /* --- rolling recording of the recent past --- */

    let newestClip = null;   // most recent finished segment
    let recorder = null;
    let chunks = [];
    let segmentTimer = null;
    let pendingFlush = null;
    let disposed = false;

    function startSegment() {
      if (disposed || state.frozen || state.mode !== 'loop') return;
      if (!REC_MIME || sourceTrack.readyState !== 'live') return;
      let rec;
      try {
        rec = new MediaRecorder(new MediaStream([sourceTrack]), {
          mimeType: REC_MIME,
          videoBitsPerSecond: 2500000
        });
      } catch (e) {
        return; // recording unavailable - still-frame mode still works
      }
      recorder = rec;
      chunks = [];
      const startedAt = Date.now();
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = chunks.length ? new Blob(chunks, { type: REC_MIME }) : null;
        const duration = Date.now() - startedAt;
        chunks = [];
        if (recorder === rec) recorder = null;
        if (pendingFlush) {
          const resolve = pendingFlush;
          pendingFlush = null;
          resolve(blob && duration >= MIN_CLIP_MS ? { blob, duration } : null);
          return;
        }
        if (blob && !state.frozen) newestClip = blob;
        startSegment();
      };
      try { rec.start(); } catch (e) { recorder = null; return; }
      segmentTimer = setTimeout(() => {
        if (recorder === rec && rec.state === 'recording') {
          try { rec.stop(); } catch (e) {}
        }
      }, SEGMENT_MS);
    }

    // Stop the in-flight segment and hand back what it captured, so the loop
    // can start from footage that ends at the exact moment you froze.
    function flushSegment() {
      clearTimeout(segmentTimer);
      return new Promise((resolve) => {
        if (!recorder || recorder.state !== 'recording') return resolve(null);
        pendingFlush = resolve;
        try { recorder.stop(); } catch (e) { pendingFlush = null; resolve(null); }
      });
    }

    function stopRecording() {
      clearTimeout(segmentTimer);
      pendingFlush = null;
      if (recorder && recorder.state === 'recording') {
        try { recorder.stop(); } catch (e) {}
      }
      recorder = null;
      chunks = [];
    }

    /* --- replay --- */

    let replay = null;      // <video> playing the loop
    let replayUrl = null;
    let freezeToken = 0;

    function teardownReplay() {
      state.looping = false;
      if (replay) {
        try { replay.pause(); } catch (e) {}
        replay.src = '';
        replay = null;
      }
      if (replayUrl) {
        URL.revokeObjectURL(replayUrl);
        replayUrl = null;
      }
    }

    async function beginReplay() {
      const token = ++freezeToken;
      // The fresh cut ends exactly at the freeze, but is only as long as the
      // time since this segment started. If that is a short stub, the previous
      // complete minute makes a better loop even though it is a minute old.
      const fresh = await flushSegment();
      const clip = (fresh && (fresh.duration >= PREFER_FRESH_MS || !newestClip))
        ? fresh.blob
        : (newestClip || (fresh && fresh.blob));
      if (!clip || token !== freezeToken || !state.frozen || state.mode !== 'loop') return;
      const el = document.createElement('video');
      el.muted = true;
      el.loop = true;
      el.playsInline = true;
      el.autoplay = true;
      replayUrl = URL.createObjectURL(clip);
      el.src = replayUrl;
      // Some MediaRecorder output has no duration metadata; looping by hand
      // covers the case where the loop attribute alone does not fire.
      el.addEventListener('ended', () => {
        try { el.currentTime = 0; el.play(); } catch (e) {}
      });
      try {
        await el.play();
      } catch (e) {
        URL.revokeObjectURL(replayUrl);
        replayUrl = null;
        return;
      }
      if (token !== freezeToken || !state.frozen) {
        try { el.pause(); } catch (e) {}
        URL.revokeObjectURL(replayUrl);
        replayUrl = null;
        return;
      }
      replay = el;
      state.looping = true;
      broadcast();
    }

    /* --- draw loop --- */

    function snapshot() {
      if (!canvas.width || !canvas.height) return;
      still.width = canvas.width;
      still.height = canvas.height;
      stillCtx.drawImage(canvas, 0, 0);
    }

    function tick() {
      if (state.frozen) {
        // Keep painting so captureStream never stops producing frames.
        if (replay && replay.readyState >= 2) {
          ctx.drawImage(replay, 0, 0, canvas.width, canvas.height);
        } else if (still.width) {
          ctx.drawImage(still, 0, 0, canvas.width, canvas.height);
        }
        return;
      }
      if (video.readyState < 2 || !video.videoWidth) return;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    const timer = setInterval(tick, 1000 / fps);

    const pipe = {
      onFreezeChange() {
        if (state.frozen) {
          snapshot();               // instant still, replaced by the loop moments later
          if (state.mode === 'loop') beginReplay();
          else stopRecording();
        } else {
          freezeToken++;
          teardownReplay();
          startSegment();
        }
      },
      onModeChange() {
        if (state.mode === 'still') {
          freezeToken++;
          teardownReplay();
          stopRecording();
        } else if (!state.frozen) {
          startSegment();
        }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        pipes.delete(pipe);
        clearInterval(timer);
        stopRecording();
        teardownReplay();
        try { video.pause(); } catch (e) {}
        video.srcObject = null;
        try { sourceTrack.stop(); } catch (e) {}
      }
    };
    pipes.add(pipe);
    if (state.frozen) snapshot();
    startSegment();

    sourceTrack.addEventListener('ended', () => {
      pipe.dispose();
      try { outTrack.stop(); } catch (e) {}
      outTrack.dispatchEvent(new Event('ended'));
    });

    // Meet stopping "our" track must also release the real camera.
    const nativeStop = outTrack.stop.bind(outTrack);
    outTrack.stop = () => { pipe.dispose(); nativeStop(); };

    // Keep the fake track looking like the real device to Meet's device UI.
    const nativeGetSettings = outTrack.getSettings.bind(outTrack);
    outTrack.getSettings = () => Object.assign({}, sourceTrack.getSettings(), nativeGetSettings());
    if (sourceTrack.getCapabilities) {
      outTrack.getCapabilities = () => sourceTrack.getCapabilities();
    }
    outTrack.getConstraints = () => sourceTrack.getConstraints();
    outTrack.applyConstraints = (c) => sourceTrack.applyConstraints(c);
    try {
      Object.defineProperty(outTrack, 'label', {
        get: () => sourceTrack.label,
        configurable: true
      });
    } catch (e) {}

    // Mirror enable/disable (Meet's "turn camera off") onto the real device.
    let enabled = true;
    try {
      Object.defineProperty(outTrack, 'enabled', {
        get: () => enabled,
        set: (v) => { enabled = !!v; sourceTrack.enabled = !!v; },
        configurable: true
      });
    } catch (e) {}

    return outTrack;
  }

  function wrapStream(stream) {
    const videoTracks = stream.getVideoTracks();
    if (!videoTracks.length) return stream;
    const out = new MediaStream();
    for (const t of stream.getAudioTracks()) out.addTrack(t);
    for (const t of videoTracks) {
      try {
        out.addTrack(makePipe(t));
      } catch (e) {
        console.warn('[Meet Camera Freeze] falling back to raw track:', e);
        out.addTrack(t);
      }
    }
    return out;
  }

  /* ---------- getUserMedia patch ---------- */

  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = async function (constraints) {
      const stream = await original(constraints);
      if (!constraints || !constraints.video) return stream;
      return wrapStream(stream);
    };
  }

  /* ---------- controls ---------- */

  window.addEventListener('MCF_COMMAND', (e) => {
    const action = e.detail && e.detail.action;
    if (action === 'toggle') setFrozen(!state.frozen);
    else if (action === 'freeze') setFrozen(true);
    else if (action === 'unfreeze') setFrozen(false);
    else if (action === 'mode:loop') setMode('loop');
    else if (action === 'mode:still') setMode('still');
    else if (action === 'query') broadcast();
  });

  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.code === 'KeyF' || String(e.key).toLowerCase() === 'f')) {
      e.preventDefault();
      e.stopPropagation();
      setFrozen(!state.frozen);
    }
  }, true);

  /* ---------- on-screen button (top frame only) ---------- */

  let button = null;

  function paintButton() {
    if (!button) return;
    button.textContent = state.frozen
      ? (state.looping ? '❄ Looping' : '❄ Frozen')
      : '● Live';
    button.style.background = state.frozen ? '#1a73e8' : 'rgba(32,33,36,.85)';
  }

  function mountButton() {
    if (button || window.top !== window || !document.body) return;
    button = document.createElement('button');
    button.type = 'button';
    button.title = 'Freeze / unfreeze camera (Alt+Shift+F)';
    button.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px', 'z-index:2147483647',
      'font:500 13px/1 Google Sans,Roboto,Arial,sans-serif', 'color:#fff',
      'border:0', 'border-radius:16px', 'padding:8px 14px', 'cursor:pointer',
      'box-shadow:0 1px 4px rgba(0,0,0,.4)', 'opacity:.85'
    ].join(';');
    button.addEventListener('click', (e) => {
      e.preventDefault();
      setFrozen(!state.frozen);
    });
    document.body.appendChild(button);
    paintButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton, { once: true });
  } else {
    mountButton();
  }
})();
