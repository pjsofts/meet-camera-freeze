const btn = document.getElementById('toggle');
const hint = document.getElementById('hint');
let tabId = null;

function render(state) {
  const frozen = !!(state && state.frozen);
  btn.textContent = frozen ? '❄ Frozen — click to resume' : '● Live — click to freeze';
  btn.classList.toggle('frozen', frozen);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/meet\.google\.com\//.test(tab.url || '')) {
    btn.textContent = 'Open a Google Meet tab';
    btn.disabled = true;
    return;
  }
  tabId = tab.id;
  try {
    render(await chrome.tabs.sendMessage(tabId, { type: 'MCF_COMMAND', action: 'state' }));
  } catch (e) {
    btn.textContent = 'Reload the Meet tab';
    btn.disabled = true;
    hint.textContent = 'The extension was loaded after this tab; reload it once.';
  }
}

btn.addEventListener('click', async () => {
  if (tabId == null) return;
  try {
    render(await chrome.tabs.sendMessage(tabId, { type: 'MCF_COMMAND', action: 'toggle' }));
  } catch (e) {}
});

init();
