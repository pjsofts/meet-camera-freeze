/* ISOLATED world: relays extension messages <-> the MAIN-world script. */
let lastState = { frozen: false, mode: 'loop', looping: false };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'MCF_COMMAND') return;
  if (msg.action !== 'state') {
    window.dispatchEvent(new CustomEvent('MCF_COMMAND', { detail: { action: msg.action } }));
  }
  sendResponse(lastState);
});

window.addEventListener('MCF_STATE', (e) => {
  const d = e.detail || {};
  lastState = { frozen: !!d.frozen, mode: d.mode || 'loop', looping: !!d.looping };
  chrome.runtime.sendMessage({ type: 'MCF_STATE', frozen: lastState.frozen }).catch(() => {});
});

// Ask the page for its current state once it has loaded.
window.dispatchEvent(new CustomEvent('MCF_COMMAND', { detail: { action: 'query' } }));
