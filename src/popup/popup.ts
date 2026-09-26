const toggle = document.getElementById('enabled') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLElement;

function render(enabled: boolean) {
  toggle.checked = enabled;
  statusEl.textContent = enabled ? 'Enabled on chatgpt.com' : 'Turned off';
}

chrome.storage.sync.get({ enabled: true }).then((s) => render(s.enabled !== false));

toggle.addEventListener('change', () => {
  render(toggle.checked);
  chrome.storage.sync.set({ enabled: toggle.checked });
});
