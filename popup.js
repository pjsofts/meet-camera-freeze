const btn = document.getElementById('toggle');
const hint = document.getElementById('hint');
const modeButtons = {
  loop: document.getElementById('mode-loop'),
  still: document.getElementById('mode-still')
};
let tabId = null;

function render(state) {
  const frozen = !!(state && state.frozen);
  const mode = (state && state.mode) || 'loop';
  const looping = !!(state && state.looping);
  btn.textContent = frozen
    ? (looping ? '❄ Looping — click to resume' : '❄ Frozen — click to resume')
    : '● Live — click to freeze';
  btn.classList.toggle('frozen', frozen);
  modeButtons.loop.classList.toggle('on', mode === 'loop');
  modeButtons.still.classList.toggle('on', mode === 'still');
}

async function send(action) {
  if (tabId == null) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'MCF_COMMAND', action });
  } catch (e) {
    return null;
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/meet\.google\.com\//.test(tab.url || '')) {
    btn.textContent = 'Open a Google Meet tab';
    btn.disabled = true;
    return;
  }
  tabId = tab.id;
  const state = await send('state');
  if (!state) {
    btn.textContent = 'Reload the Meet tab';
    btn.disabled = true;
    hint.textContent = 'The extension was loaded after this tab; reload it once.';
    return;
  }
  render(state);
}

btn.addEventListener('click', async () => {
  render(await send('toggle'));
  // The loop starts a beat after freezing, so pick up the final state.
  setTimeout(async () => render(await send('state')), 400);
});

modeButtons.loop.addEventListener('click', async () => render(await send('mode:loop')));
modeButtons.still.addEventListener('click', async () => render(await send('mode:still')));

init();
