chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-freeze') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.id || !/^https:\/\/meet\.google\.com\//.test(tab.url || '')) return;
  chrome.tabs.sendMessage(tab.id, { type: 'MCF_COMMAND', action: 'toggle' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'MCF_STATE' && sender.tab) {
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.frozen ? '❄' : '' });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#1a73e8' });
  }
});
