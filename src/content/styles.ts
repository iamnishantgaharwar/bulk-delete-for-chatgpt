import UI_CSS from 'virtual:ui-css';

export { UI_CSS };

// Styles for the page itself (row state only — namespaced by data-cbd-* attributes).
// Everything else is Tailwind inside our shadow roots (src/styles/ui.css).
export const GLOBAL_CSS = `
html:not([data-cbd-select]) .cbd-cb { display: none !important; }
.cbd-cb { display: inline-flex; flex: none; align-items: center; margin-right: 8px; }
html[data-cbd-select] a[data-cbd-id] { cursor: pointer; user-select: none; }
html[data-cbd-select] [data-cbd-selected] { background: rgba(128, 128, 128, 0.18) !important; border-radius: 10px; }
/* Lets the last chats scroll above the floating action bar. */
html[data-cbd-select] [data-cbd-scroll-pad] { padding-bottom: var(--cbd-bar-space, 200px) !important; }
[data-cbd-dim] { opacity: 0.35; }
[data-cbd-deleted] { display: none !important; }
[data-cbd-pending] { opacity: 0.45; text-decoration: line-through; }
[data-cbd-pending] .cbd-cb { visibility: hidden; }
#cbd-toggle-host { display: block; padding: 2px 6px 6px; }
#cbd-toggle-host.cbd-floating { position: fixed; left: 12px; bottom: 72px; z-index: 2147483000; padding: 0; }
`;
