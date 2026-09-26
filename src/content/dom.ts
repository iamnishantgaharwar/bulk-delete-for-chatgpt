import { UI_CSS } from './styles';

type Props = Record<string, unknown> & { class?: string; style?: string };

/** Tiny element builder: h('button', { class: 'x', onclick: fn }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k in el && typeof v !== 'string') {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) if (c != null && c !== false) el.append(c);
  return el;
}

// One compiled Tailwind sheet shared by every shadow root (there's one per chat row).
let sharedSheet: CSSStyleSheet | null | undefined;
function uiSheet(): CSSStyleSheet | null {
  if (sharedSheet === undefined) {
    try {
      sharedSheet = new CSSStyleSheet();
      sharedSheet.replaceSync(UI_CSS);
    } catch {
      sharedSheet = null;
    }
  }
  return sharedSheet;
}

export function shadowHost<K extends keyof HTMLElementTagNameMap>(tag: K, id?: string) {
  const host = document.createElement(tag);
  if (id) host.id = id;
  const root = host.attachShadow({ mode: 'open' });
  const sheet = uiSheet();
  try {
    if (!sheet) throw new Error('no constructable sheet');
    root.adoptedStyleSheets = [sheet];
  } catch {
    root.append(h('style', {}, UI_CSS));
  }
  return { host, root };
}

// Inline icons (Lucide-style, 24px grid, stroke = currentColor).
const ICONS = {
  check: '<path d="M5 12.5 10 17l9-10"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  listCheck: '<path d="M11 6h9M11 12h9M11 18h9"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  arrowDown: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = 'size-4', strokeWidth = 2) {
  const span = h('span', { class: `inline-flex shrink-0 ${cls}`, 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

// Shared Tailwind class recipes for buttons.
const BTN =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-btn px-3.5 py-1.5 text-[13px] font-medium ' +
  'transition-[background-color,opacity,filter] duration-150 cursor-pointer ' +
  'disabled:cursor-not-allowed disabled:opacity-40 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export const btn = {
  primary: `${BTN} bg-accent text-accent-fg hover:enabled:opacity-90`,
  secondary: `${BTN} border border-line bg-surface text-fg hover:enabled:bg-surface-2`,
  danger: `${BTN} bg-danger text-danger-fg hover:enabled:brightness-110`,
  ghost: `${BTN} text-muted hover:enabled:bg-surface-2 hover:enabled:text-fg`,
  icon:
    'inline-flex size-7 items-center justify-center rounded-full text-muted transition-colors cursor-pointer ' +
    'hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring',
};
