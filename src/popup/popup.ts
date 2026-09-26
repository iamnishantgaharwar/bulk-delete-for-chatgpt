const toggle = document.getElementById('enabled') as HTMLInputElement;

chrome.storage.sync.get({ enabled: true }).then((s) => {
  toggle.checked = s.enabled !== false;
});

toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});
