import { applyAppearance, loadAppearance } from '../shared/appearance';

const toggle = document.getElementById('enabled') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLElement;

function render(enabled: boolean) {
  toggle.checked = enabled;
  statusEl.textContent = enabled ? 'Enabled on chatgpt.com' : 'Turned off';
}

chrome.storage.sync.get({ enabled: true }).then((s) => render(s.enabled !== false));
loadAppearance().then((a) => applyAppearance(document.documentElement, a));

toggle.addEventListener('change', () => {
  render(toggle.checked);
  chrome.storage.sync.set({ enabled: toggle.checked });
});

document.getElementById('open-settings')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
