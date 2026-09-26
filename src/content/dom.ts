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

export function shadowHost<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, id?: string) {
  const host = document.createElement(tag);
  if (id) host.id = id;
  const root = host.attachShadow({ mode: 'open' });
  root.append(h('style', {}, css));
  return { host, root };
}

export const CHECK_SVG =
  '<svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2 5 8.5l4.5-5"/></svg>';
