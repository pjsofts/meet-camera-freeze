/*
 * Runs in the page's MAIN world at document_start, before Meet's own scripts.
 * It wraps navigator.mediaDevices.getUserMedia so every camera track Meet
 * receives is actually a canvas capture of the real camera. Freezing just means
 * "keep painting the last snapshot instead of new frames", so the track stays
 * live and the call keeps running - remote participants simply see a still.
 */
(() => {
  if (window.__mcfInstalled) return;
  window.__mcfInstalled = true;

  const state = { frozen: false };
  const pipes = new Set();

  function broadcast() {
    window.dispatchEvent(new CustomEvent('MCF_STATE', { detail: { frozen: state.frozen } }));
    paintButton();
  }

  function setFrozen(next) {
    next = !!next;
    if (next !== state.frozen) {
      state.frozen = next;
      for (const pipe of pipes) pipe.onFreezeChange();
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

    // Holds the still we keep re-painting while frozen.
    const still = document.createElement('canvas');
    const stillCtx = still.getContext('2d', { alpha: false });

    const fps = Math.min(60, Math.max(1, Math.round(settings.frameRate || 30)));
    const outStream = canvas.captureStream(fps);
    const outTrack = outStream.getVideoTracks()[0];

    function snapshot() {
      if (!canvas.width || !canvas.height) return;
      still.width = canvas.width;
      still.height = canvas.height;
      stillCtx.drawImage(canvas, 0, 0);
    }

    function tick() {
      if (state.frozen) {
        // Re-paint the frozen frame so captureStream keeps producing frames
        // (a track that stops producing can be dropped by the encoder).
        if (still.width) ctx.drawImage(still, 0, 0, canvas.width, canvas.height);
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
        if (state.frozen) snapshot();
      },
      dispose() {
        if (!pipes.has(pipe)) return;
        pipes.delete(pipe);
        clearInterval(timer);
        try { video.pause(); } catch (e) {}
        video.srcObject = null;
        try { sourceTrack.stop(); } catch (e) {}
      }
    };
    pipes.add(pipe);
    if (state.frozen) snapshot();

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
    else if (action === 'query') broadcast();
  });

  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.code === 'KeyF' || e.key.toLowerCase() === 'f')) {
      e.preventDefault();
      e.stopPropagation();
      setFrozen(!state.frozen);
    }
  }, true);

  /* ---------- on-screen button (top frame only) ---------- */

  let button = null;

  function paintButton() {
    if (!button) return;
    button.textContent = state.frozen ? '❄ Frozen' : '● Live';
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
