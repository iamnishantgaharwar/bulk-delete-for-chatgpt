// Minimal service worker: only sets defaults on install/update.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') await chrome.storage.sync.set({ enabled: true });
});
