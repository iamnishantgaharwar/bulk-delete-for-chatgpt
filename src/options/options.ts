import {
  ACCENT_SWATCHES,
  DANGER_SWATCHES,
  DEFAULT_APPEARANCE,
  PRESETS,
  RADII,
  applyAppearance,
  loadAppearance,
  normalize,
  onAppearanceChange,
  sameAppearance,
  saveAppearance,
  type Appearance,
  type Radius,
} from '../shared/appearance';

let state: Appearance = DEFAULT_APPEARANCE;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const SWATCH =
  `size-8 cursor-pointer rounded-full border border-black/10 transition-transform hover:scale-110 ${FOCUS} ` +
  'aria-pressed:ring-2 aria-pressed:ring-fg aria-pressed:ring-offset-2 aria-pressed:ring-offset-surface';
const CHOICE =
  `flex cursor-pointer flex-col items-stretch gap-2.5 rounded-xl border border-line p-3 text-left transition-colors hover:bg-surface-2 ${FOCUS} ` +
  'aria-pressed:border-fg aria-pressed:ring-1 aria-pressed:ring-fg';

// ---- persistence ----------------------------------------------------------

let savedTimer: number | undefined;
let saveTimer: number | undefined;

function update(next: Partial<Appearance>, { debounce = false, rerender = true } = {}) {
  state = normalize({ ...state, ...next });
  if (rerender) render();
  else applyAppearance(document.documentElement, state);
  clearTimeout(saveTimer);
  const save = () =>
    saveAppearance(state).then(() => {
      const saved = $('saved');
      saved.classList.remove('opacity-0');
      clearTimeout(savedTimer);
      savedTimer = window.setTimeout(() => saved.classList.add('opacity-0'), 1200);
    });
  // Colour pickers fire continuously while dragging; don't hammer storage.sync's write quota.
  if (debounce) saveTimer = window.setTimeout(save, 300);
  else void save();
}

// ---- controls -------------------------------------------------------------

function renderPresets() {
  const root = $('presets');
  root.replaceChildren(
    ...PRESETS.map((p) => {
      const a = p.appearance;
      const r = RADII[a.radius];
      const sample = el(
        'div',
        { class: 'flex items-center gap-1.5' },
        el('span', {
          class: 'size-4 border border-black/10',
          style: `border-radius:${r.check};background:${a.accent ?? 'linear-gradient(135deg,#0d0d0d 50%,#fff 50%)'}`,
        }),
        el('span', {
          class: 'h-4 flex-1 border border-black/10',
          style: `border-radius:${r.btn};background:${a.danger ?? '#e02e2a'}`,
        }),
      );
      const btn = el('button', { class: CHOICE, 'aria-pressed': String(sameAppearance(a, state)) }, sample, el('span', { class: 'text-[13px] font-medium' }, p.name));
      btn.addEventListener('click', () => update(a));
      return btn;
    }),
  );
}

/** A row of colour swatches: a default option, presets, and a custom picker. */
function renderColorRow(rootId: string, key: 'accent' | 'danger', swatches: string[], defaultLabel: string, defaultBg: string) {
  const current = state[key];
  const root = $(rootId);

  const auto = el('button', {
    class: SWATCH,
    title: defaultLabel,
    'aria-label': defaultLabel,
    'aria-pressed': String(current === null),
    style: `background:${defaultBg}`,
  });
  auto.addEventListener('click', () => update({ [key]: null }));

  const items = swatches.map((hex) => {
    const b = el('button', { class: SWATCH, title: hex, 'aria-label': hex, 'aria-pressed': String(current === hex), style: `background:${hex}` });
    b.addEventListener('click', () => update({ [key]: hex }));
    return b;
  });

  const isCustom = current !== null && !swatches.includes(current);
  const picker = el('input', {
    type: 'color',
    class: 'absolute inset-0 size-full cursor-pointer opacity-0',
    'aria-label': 'Custom color',
  }) as HTMLInputElement;
  picker.value = current ?? (key === 'accent' ? '#2563eb' : '#dc2626');
  // While dragging, only recolour (re-rendering would destroy the open picker); redraw once it closes.
  picker.addEventListener('input', () => {
    update({ [key]: picker.value }, { debounce: true, rerender: false });
    customSwatch.style.background = picker.value;
    hex.value = picker.value;
  });
  picker.addEventListener('change', () => update({ [key]: picker.value }, { debounce: true }));
  const customSwatch = el(
    'label',
    {
      class: `relative ${SWATCH} grid place-items-center overflow-hidden`,
      title: 'Custom color',
      'aria-pressed': String(isCustom),
      style: `background:${isCustom ? current : 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)'}`,
    },
    picker,
  );

  const hex = el('input', {
    type: 'text',
    value: current ?? '',
    placeholder: 'Default',
    maxlength: '7',
    spellcheck: 'false',
    'aria-label': 'Hex color',
    class: `ml-1 w-24 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[12px] uppercase outline-none ${FOCUS} focus:outline-2 focus:outline-ring`,
  }) as HTMLInputElement;
  hex.addEventListener('change', () => {
    const v = hex.value.trim();
    const withHash = v.startsWith('#') ? v : `#${v}`;
    if (!v) update({ [key]: null });
    else if (/^#[0-9a-f]{6}$/i.test(withHash)) update({ [key]: withHash });
    else hex.value = current ?? '';
  });

  root.replaceChildren(auto, el('span', { class: 'mx-1 h-6 w-px bg-line' }), ...items, customSwatch, hex);
}

function renderRadius() {
  const root = $('radius');
  root.replaceChildren(
    ...(Object.keys(RADII) as Radius[]).map((key) => {
      const r = RADII[key];
      const sample = el(
        'div',
        { class: 'flex h-10 items-center justify-center rounded-lg bg-surface-2' },
        el('span', { class: 'border border-line bg-surface px-3 py-1 text-[12px] font-medium', style: `border-radius:${r.btn}` }, 'Button'),
      );
      const btn = el('button', { class: CHOICE, 'aria-pressed': String(state.radius === key) }, sample, el('span', { class: 'text-[13px] font-medium' }, r.label));
      btn.addEventListener('click', () => update({ radius: key }));
      return btn;
    }),
  );
}

function renderPreviews() {
  const tpl = $<HTMLTemplateElement>('preview-template');
  for (const [id, label] of [['preview-light', 'Light'], ['preview-dark', 'Dark']] as const) {
    const root = $(id);
    if (root.childElementCount) continue; // static markup; tokens update it live
    const node = tpl.content.cloneNode(true) as DocumentFragment;
    node.querySelector('[data-label]')!.textContent = label;
    root.append(node);
  }
}

function render() {
  applyAppearance(document.documentElement, state);
  renderPresets();
  renderColorRow('accent', 'accent', ACCENT_SWATCHES, 'Auto — match ChatGPT', 'linear-gradient(135deg,#0d0d0d 50%,#fff 50%)');
  renderColorRow('danger', 'danger', DANGER_SWATCHES, 'Default red', '#e02e2a');
  renderRadius();
  renderPreviews();
}

$('reset').addEventListener('click', () => update(DEFAULT_APPEARANCE));

// Keep in sync if settings change elsewhere (another settings tab, sync from another device).
onAppearanceChange((a) => {
  if (!sameAppearance(a, state)) {
    state = a;
    render();
  }
});

loadAppearance().then((a) => {
  state = a;
  render();
});
