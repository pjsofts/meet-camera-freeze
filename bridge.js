/* ISOLATED world: relays extension messages <-> the MAIN-world script. */
let lastState = { frozen: false };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'MCF_COMMAND') return;
  if (msg.action === 'state') {
    sendResponse(lastState);
    return;
  }
  window.dispatchEvent(new CustomEvent('MCF_COMMAND', { detail: { action: msg.action } }));
  sendResponse(lastState);
});

window.addEventListener('MCF_STATE', (e) => {
  lastState = { frozen: !!(e.detail && e.detail.frozen) };
  chrome.runtime.sendMessage({ type: 'MCF_STATE', frozen: lastState.frozen }).catch(() => {});
});

// Ask the page for its current state once it has loaded.
window.dispatchEvent(new CustomEvent('MCF_COMMAND', { detail: { action: 'query' } }));
