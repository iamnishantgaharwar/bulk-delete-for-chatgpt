// User-customisable look of the extension's own UI (not ChatGPT's).
// Saved in chrome.storage.sync and applied as --cbd-user-* CSS variables on
// <html>; they inherit into every shadow root, where theme.css picks them up.

export type Radius = 'sharp' | 'rounded' | 'pill';

export interface Appearance {
  /** Checkboxes, active toggle, progress bar, selected-row tint. null = match ChatGPT (black/white). */
  accent: string | null;
  /** Delete buttons. null = default red. */
  danger: string | null;
  radius: Radius;
}

export const DEFAULT_APPEARANCE: Appearance = { accent: null, danger: null, radius: 'pill' };

export const RADII: Record<Radius, { label: string; btn: string; field: string; card: string; modal: string; check: string }> = {
  sharp: { label: 'Sharp', btn: '4px', field: '4px', card: '6px', modal: '8px', check: '2px' },
  rounded: { label: 'Rounded', btn: '8px', field: '8px', card: '12px', modal: '16px', check: '4px' },
  pill: { label: 'Pill', btn: '999px', field: '12px', card: '16px', modal: '24px', check: '5px' },
};

export const PRESETS: { id: string; name: string; appearance: Appearance }[] = [
  { id: 'classic', name: 'Classic', appearance: DEFAULT_APPEARANCE },
  { id: 'ocean', name: 'Ocean', appearance: { accent: '#2563eb', danger: '#dc2626', radius: 'rounded' } },
  { id: 'forest', name: 'Forest', appearance: { accent: '#059669', danger: '#dc2626', radius: 'rounded' } },
  { id: 'grape', name: 'Grape', appearance: { accent: '#7c3aed', danger: '#e11d48', radius: 'pill' } },
  { id: 'sunset', name: 'Sunset', appearance: { accent: '#ea580c', danger: '#be123c', radius: 'pill' } },
  { id: 'minimal', name: 'Minimal', appearance: { accent: null, danger: '#52525b', radius: 'sharp' } },
];

export const ACCENT_SWATCHES = ['#2563eb', '#0891b2', '#059669', '#65a30d', '#d97706', '#ea580c', '#e11d48', '#db2777', '#7c3aed', '#4f46e5'];
export const DANGER_SWATCHES = ['#dc2626', '#e11d48', '#be123c', '#ea580c', '#b45309', '#52525b'];

const KEY = 'appearance';
const HEX = /^#[0-9a-f]{6}$/i;

export function normalize(value: unknown): Appearance {
  const v = (value ?? {}) as Partial<Appearance>;
  return {
    accent: typeof v.accent === 'string' && HEX.test(v.accent) ? v.accent.toLowerCase() : null,
    danger: typeof v.danger === 'string' && HEX.test(v.danger) ? v.danger.toLowerCase() : null,
    radius: v.radius && v.radius in RADII ? v.radius : DEFAULT_APPEARANCE.radius,
  };
}

export async function loadAppearance(): Promise<Appearance> {
  const stored = await chrome.storage.sync.get(KEY);
  return normalize(stored[KEY]);
}

export function saveAppearance(a: Appearance) {
  return chrome.storage.sync.set({ [KEY]: normalize(a) });
}

export function onAppearanceChange(cb: (a: Appearance) => void) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && KEY in changes) cb(normalize(changes[KEY].newValue));
  });
}

export function sameAppearance(a: Appearance, b: Appearance) {
  return a.accent === b.accent && a.danger === b.danger && a.radius === b.radius;
}

/** Black or white, whichever reads better on the given background. */
export function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#0d0d0d' : '#ffffff';
}

const VARS = [
  '--cbd-user-accent', '--cbd-user-accent-fg', '--cbd-user-danger', '--cbd-user-danger-fg',
  '--cbd-user-radius-btn', '--cbd-user-radius-field', '--cbd-user-radius-card', '--cbd-user-radius-modal', '--cbd-user-radius-check',
];

export function applyAppearance(el: HTMLElement, a: Appearance) {
  const set = (name: string, value: string | null) =>
    value ? el.style.setProperty(name, value) : el.style.removeProperty(name);
  set('--cbd-user-accent', a.accent);
  set('--cbd-user-accent-fg', a.accent && readableOn(a.accent));
  set('--cbd-user-danger', a.danger);
  set('--cbd-user-danger-fg', a.danger && readableOn(a.danger));
  const r = RADII[a.radius];
  set('--cbd-user-radius-btn', r.btn);
  set('--cbd-user-radius-field', r.field);
  set('--cbd-user-radius-card', r.card);
  set('--cbd-user-radius-modal', r.modal);
  set('--cbd-user-radius-check', r.check);
}

export function clearAppearance(el: HTMLElement) {
  for (const v of VARS) el.style.removeProperty(v);
}
