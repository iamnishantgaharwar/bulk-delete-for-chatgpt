import { BulkDeleteApp } from './app';

const STORAGE_KEY = 'enabled';
let app: BulkDeleteApp | null = null;

function apply(enabled: boolean) {
  if (enabled && !app) {
    app = new BulkDeleteApp();
    app.mount();
  } else if (!enabled && app) {
    app.unmount();
    app = null;
  }
}

chrome.storage.sync.get({ [STORAGE_KEY]: true }).then((s) => apply(s[STORAGE_KEY] !== false));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && STORAGE_KEY in changes) apply(changes[STORAGE_KEY].newValue !== false);
});
