import { applyAppearance, clearAppearance, loadAppearance, onAppearanceChange } from '../shared/appearance';
import { BulkDeleteApp } from './app';

const STORAGE_KEY = 'enabled';
let app: BulkDeleteApp | null = null;

function apply(enabled: boolean) {
  if (enabled && !app) {
    app = new BulkDeleteApp();
    app.mount();
    loadAppearance().then((a) => applyAppearance(document.documentElement, a));
  } else if (!enabled && app) {
    app.unmount();
    app = null;
    clearAppearance(document.documentElement);
  }
}

chrome.storage.sync.get({ [STORAGE_KEY]: true }).then((s) => apply(s[STORAGE_KEY] !== false));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && STORAGE_KEY in changes) apply(changes[STORAGE_KEY].newValue !== false);
});

// Appearance edits from the settings page apply live.
onAppearanceChange((a) => {
  if (app) applyAppearance(document.documentElement, a);
});
