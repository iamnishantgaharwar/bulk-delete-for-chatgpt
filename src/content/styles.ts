// Styles for the page itself (row state only — namespaced by data-cbd-* attributes).
export const GLOBAL_CSS = `
html:not([data-cbd-select]) .cbd-cb { display: none !important; }
.cbd-cb { display: inline-flex; flex: none; align-items: center; margin-right: 8px; }
html[data-cbd-select] a[data-cbd-id] { cursor: pointer; user-select: none; }
[data-cbd-selected] { background: rgba(16, 163, 127, 0.14) !important; border-radius: 8px; }
[data-cbd-dim] { opacity: 0.35; }
[data-cbd-deleted] { display: none !important; }
[data-cbd-pending] { opacity: 0.45; text-decoration: line-through; }
[data-cbd-pending] .cbd-cb { visibility: hidden; }
#cbd-toggle-host { display: block; padding: 4px 8px; }
#cbd-toggle-host.cbd-floating { position: fixed; left: 12px; bottom: 72px; z-index: 2147483000; padding: 0; }
`;

// Shared tokens for everything inside our shadow roots. ChatGPT sets class="dark" on <html>.
const TOKENS = `
:host {
  --bg: #ffffff; --bg-2: #f4f4f5; --fg: #0d0d0d; --fg-2: #5d5d66; --border: #e3e3e6;
  --accent: #10a37f; --danger: #d92d20; --danger-fg: #ffffff; --shadow: 0 8px 30px rgba(0,0,0,.18);
  font: 13px/1.4 ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
  color: var(--fg);
}
:host-context(html.dark) {
  --bg: #212121; --bg-2: #2f2f2f; --fg: #ececec; --fg-2: #a9a9b3; --border: #3d3d3d;
  --danger: #f04438; --shadow: 0 8px 30px rgba(0,0,0,.5);
}
* { box-sizing: border-box; }
button {
  font: inherit; cursor: pointer; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg); color: var(--fg); padding: 5px 10px; white-space: nowrap;
}
button:hover:not(:disabled) { background: var(--bg-2); }
button:disabled { opacity: .45; cursor: not-allowed; }
button.danger { background: var(--danger); border-color: var(--danger); color: var(--danger-fg); font-weight: 600; }
button.danger:hover:not(:disabled) { filter: brightness(1.08); background: var(--danger); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
input[type="text"] {
  font: inherit; width: 100%; padding: 6px 9px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--bg-2); color: var(--fg);
}
`;

export const TOGGLE_CSS = `${TOKENS}
button { width: 100%; text-align: left; display: flex; align-items: center; gap: 8px; }
button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
`;

export const CHECKBOX_CSS = `${TOKENS}
.box {
  width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid var(--fg-2);
  display: grid; place-items: center; background: transparent;
}
.box svg { width: 12px; height: 12px; visibility: hidden; }
:host([data-checked]) .box { background: var(--accent); border-color: var(--accent); }
:host([data-checked]) .box svg { visibility: visible; }
`;

export const APP_CSS = `${TOKENS}
.bar {
  position: fixed; z-index: 2147483000; bottom: 12px; left: 12px; width: 280px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
  box-shadow: var(--shadow); padding: 10px; display: flex; flex-direction: column; gap: 8px;
}
.bar[hidden] { display: none; }
.row { display: flex; gap: 6px; align-items: center; }
.row > .grow { flex: 1; }
.count { font-weight: 600; }
.muted { color: var(--fg-2); }
.link-btn { border: none; background: none; color: var(--accent); padding: 2px 4px; }
.link-btn:hover:not(:disabled) { background: none; text-decoration: underline; }

.backdrop {
  position: fixed; inset: 0; z-index: 2147483001; background: rgba(0,0,0,.45);
  display: grid; place-items: center; padding: 16px;
}
.modal {
  width: min(460px, 100%); max-height: min(640px, 100%); display: flex; flex-direction: column; gap: 12px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); padding: 20px;
}
.modal h2 { margin: 0; font-size: 17px; }
.list {
  margin: 0; padding: 6px 0; list-style: none; overflow: auto; min-height: 60px; max-height: 280px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--bg-2);
}
.list li { padding: 4px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list li .err { color: var(--danger); font-size: 12px; margin-left: 6px; }
.warn { color: var(--danger); font-weight: 600; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.progress { height: 8px; border-radius: 99px; background: var(--bg-2); overflow: hidden; border: 1px solid var(--border); }
.progress > div { height: 100%; width: 0; background: var(--accent); transition: width .2s; }
.current { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stats { display: flex; gap: 16px; }
.stats b { font-size: 20px; display: block; }
.list.small { max-height: 120px; min-height: 0; }

.panel {
  position: fixed; z-index: 2147483000; right: 16px; bottom: 16px; width: 320px; max-width: calc(100vw - 32px);
  background: var(--bg); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow);
  padding: 12px; display: flex; flex-direction: column; gap: 10px;
}
.panel[hidden] { display: none; }
.panel.min { width: 240px; gap: 8px; padding: 8px 12px; }
.panel.min .panel-body { display: none; }
.panel-head { display: flex; align-items: center; gap: 8px; }
.panel-head .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panel-body { display: flex; flex-direction: column; gap: 10px; }
.icon-btn { border: none; background: none; padding: 2px 6px; color: var(--fg-2); }
`;
