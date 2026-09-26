import { CONFIG } from '../config';
import { SessionExpiredError, listConversations, type ChatSummary } from './api';
import type { ChatRef } from './deleter';
import { btn, h, icon } from './dom';

type Sort = 'newest' | 'oldest' | 'az';
type Age = 'all' | '7' | '30' | '90' | '365';

export interface ManagerHooks {
  isPending(id: string): boolean;
  isDeleted(id: string): boolean;
  /** Chats currently in the sidebar — used if the full history can't be loaded. */
  sidebarChats(): ChatSummary[];
  /** Opens the confirm window; the app enqueues and closes the manager on confirm. */
  requestDelete(chats: ChatRef[]): void;
}

const DAY = 86_400_000;
const CACHE_MS = 60_000;

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

function relativeTime(ms: number | null): string {
  if (ms == null) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  const units: [number, string][] = [
    [365 * DAY, 'year'], [30 * DAY, 'month'], [7 * DAY, 'week'], [DAY, 'day'], [3_600_000, 'hour'], [60_000, 'minute'],
  ];
  for (const [size, unit] of units) {
    if (diff >= size) {
      const n = Math.floor(diff / size);
      return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    }
  }
  return '';
}

const SELECT_CLS =
  'cursor-pointer rounded-field border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-fg outline-none ' +
  'focus-visible:outline-2 focus-visible:outline-ring';

/**
 * Full-width "Manage chats" window: every chat with its full title and date,
 * searchable and filterable by age, with multi-select and delete.
 */
export class ChatManager {
  private chats: ChatSummary[] = [];
  private loadedAt = 0;
  private loading = false;
  private loadGen = 0;
  private total: number | null = null;
  private notice = '';
  private fromSidebar = false;

  private selected = new Map<string, string>();
  private lastClickedId: string | null = null;
  private query = '';
  private sort: Sort = 'newest';
  private age: Age = 'all';
  private shown: ChatSummary[] = [];
  private renderQueued = false;

  private backdrop: HTMLDivElement | null = null;
  private listEl!: HTMLUListElement;
  private statusEl!: HTMLSpanElement;
  private shownEl!: HTMLSpanElement;
  private selectAllBtn!: HTMLButtonElement;
  private selectAllBox!: HTMLSpanElement;
  private countEl!: HTMLSpanElement;
  private clearBtn!: HTMLButtonElement;
  private deleteBtn!: HTMLButtonElement;
  private refreshBtn!: HTMLButtonElement;
  private searchInput!: HTMLInputElement;

  constructor(private layer: HTMLElement, private hooks: ManagerHooks) {}

  get isOpen() {
    return !!this.backdrop;
  }

  open() {
    if (this.backdrop) return;
    this.build();
    if (!this.chats.length || Date.now() - this.loadedAt > CACHE_MS) void this.load();
    else this.render();
    this.searchInput.focus();
  }

  close() {
    this.loadGen++; // stops an in-progress history load
    this.loading = false;
    this.backdrop?.remove();
    this.backdrop = null;
  }

  /** Re-draw (e.g. after chats were deleted or queued in the background). */
  refresh() {
    if (this.backdrop) this.scheduleRender();
  }

  selectAllShown() {
    const selectable = this.shown.filter((c) => !this.hooks.isPending(c.id));
    const allSelected = selectable.length > 0 && selectable.every((c) => this.selected.has(c.id));
    for (const c of selectable) {
      if (allSelected) this.selected.delete(c.id);
      else this.selected.set(c.id, c.title);
    }
    this.renderSelection();
  }

  // ---- data ---------------------------------------------------------------

  private async load() {
    const gen = ++this.loadGen;
    this.loading = true;
    this.notice = '';
    this.fromSidebar = false;
    const loaded: ChatSummary[] = [];
    const seen = new Set<string>();
    this.render();
    try {
      for (let page = 0; page < CONFIG.listMaxPages; page++) {
        const { items, total, raw } = await listConversations(page * CONFIG.listPageSize, CONFIG.listPageSize);
        if (gen !== this.loadGen) return;
        for (const c of items) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            loaded.push(c);
          }
        }
        this.chats = [...loaded];
        this.total = total;
        this.scheduleRender();
        if (raw < CONFIG.listPageSize) break;
        await new Promise((r) => setTimeout(r, CONFIG.listPageDelayMs));
        if (gen !== this.loadGen) return;
      }
      this.loadedAt = Date.now();
    } catch (e) {
      if (gen !== this.loadGen) return;
      if (!loaded.length) {
        // Fall back to what the sidebar has rendered.
        this.chats = this.hooks.sidebarChats();
        this.fromSidebar = true;
      }
      this.notice =
        e instanceof SessionExpiredError
          ? 'Your ChatGPT session expired — reload the page to see your full history.'
          : loaded.length
            ? 'Couldn’t load your whole history; showing what loaded so far.'
            : 'Couldn’t load your full history; showing the chats in the sidebar.';
    } finally {
      if (gen === this.loadGen) {
        this.loading = false;
        this.scheduleRender();
      }
    }
  }

  private filtered(): ChatSummary[] {
    const q = this.query.toLowerCase();
    const cutoff = this.age === 'all' ? null : Date.now() - Number(this.age) * DAY;
    const list = this.chats.filter(
      (c) =>
        !this.hooks.isDeleted(c.id) &&
        (!q || c.title.toLowerCase().includes(q)) &&
        (cutoff == null || (c.updatedAt != null && c.updatedAt < cutoff)),
    );
    const byTime = (c: ChatSummary) => c.updatedAt ?? 0;
    if (this.sort === 'oldest') list.sort((a, b) => byTime(a) - byTime(b));
    else if (this.sort === 'az') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (!this.fromSidebar) list.sort((a, b) => byTime(b) - byTime(a));
    return list;
  }

  // ---- UI -----------------------------------------------------------------

  private build() {
    this.searchInput = h('input', {
      type: 'text',
      placeholder: 'Search chat titles',
      'aria-label': 'Search chat titles',
      class: 'min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-muted',
      oninput: () => {
        this.query = this.searchInput.value.trim();
        this.scheduleRender();
      },
    });
    const sortSelect = h(
      'select',
      {
        class: SELECT_CLS,
        'aria-label': 'Sort',
        onchange: (e: Event) => {
          this.sort = (e.target as HTMLSelectElement).value as Sort;
          this.render();
        },
      },
      h('option', { value: 'newest' }, 'Newest first'),
      h('option', { value: 'oldest' }, 'Oldest first'),
      h('option', { value: 'az' }, 'Title A–Z'),
    );
    sortSelect.value = this.sort;
    const ageSelect = h(
      'select',
      {
        class: SELECT_CLS,
        'aria-label': 'Filter by age',
        onchange: (e: Event) => {
          this.age = (e.target as HTMLSelectElement).value as Age;
          this.render();
        },
      },
      h('option', { value: 'all' }, 'Any time'),
      h('option', { value: '7' }, 'Older than 1 week'),
      h('option', { value: '30' }, 'Older than 30 days'),
      h('option', { value: '90' }, 'Older than 3 months'),
      h('option', { value: '365' }, 'Older than 1 year'),
    );
    ageSelect.value = this.age;

    this.statusEl = h('span', { class: 'text-[13px] text-muted' });
    this.refreshBtn = h('button', {
      class: btn.icon,
      title: 'Reload list',
      'aria-label': 'Reload list',
      onclick: () => void this.load(),
    }, icon('refresh', 'size-4'));
    const closeBtn = h('button', { class: btn.icon, title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => this.close() }, icon('x', 'size-4'));

    this.selectAllBox = h(
      'span',
      {
        class:
          'group relative grid size-4 place-items-center rounded-check border-[1.5px] border-muted transition-colors ' +
          'data-checked:border-accent data-checked:bg-accent data-mixed:border-accent data-mixed:bg-accent',
      },
      icon('check', 'size-3 text-accent-fg invisible group-data-checked:visible', 3.5),
      icon('minus', 'absolute size-3 text-accent-fg invisible group-data-mixed:visible', 3.5),
    );
    this.shownEl = h('span', {});
    this.selectAllBtn = h('button', {
      class: 'flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-[13px] text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-ring',
      title: 'Select all shown (Ctrl/⌘ A)',
      onclick: () => this.selectAllShown(),
    }, this.selectAllBox, this.shownEl);

    this.listEl = h('ul', {
      class: 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
      role: 'listbox',
      'aria-multiselectable': 'true',
      'aria-label': 'Chats',
      onclick: (e: MouseEvent) => this.onListClick(e),
      onmousedown: (e: MouseEvent) => {
        if (e.shiftKey) e.preventDefault(); // no text selection on shift-click
      },
    });

    this.countEl = h('span', { class: 'text-[15px] font-semibold tabular-nums' }, '0');
    this.clearBtn = h('button', {
      class: btn.ghost,
      onclick: () => {
        this.selected.clear();
        this.lastClickedId = null;
        this.renderSelection();
      },
    }, 'Clear');
    this.deleteBtn = h('button', {
      class: `${btn.danger} px-5 py-2`,
      onclick: () => {
        const chats = [...this.selected].map(([id, title]) => ({ id, title }));
        if (chats.length) this.hooks.requestDelete(chats);
      },
    }, icon('trash'), h('span', {}, 'Delete'));

    const modal = h(
      'div',
      {
        class:
          'animate-in flex h-[min(760px,calc(100vh-2rem))] w-[min(960px,100%)] flex-col overflow-hidden rounded-modal ' +
          'border border-line bg-surface text-fg shadow-float',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'cbd-manager-title',
      },
      // header
      h(
        'div',
        { class: 'flex items-center gap-3 border-b border-line px-5 py-4' },
        h('div', { class: 'min-w-0 flex-1' },
          h('h2', { id: 'cbd-manager-title', class: 'text-[17px] font-semibold' }, 'Manage chats'),
          this.statusEl,
        ),
        this.refreshBtn,
        closeBtn,
      ),
      // toolbar
      h(
        'div',
        { class: 'flex flex-wrap items-center gap-2 border-b border-line px-5 py-3' },
        h(
          'label',
          {
            class:
              'flex min-w-60 flex-1 items-center gap-2 rounded-field border border-line bg-surface-2 px-3 py-1.5 text-muted ' +
              'focus-within:outline-2 focus-within:outline-ring',
          },
          icon('search', 'size-4'),
          this.searchInput,
        ),
        ageSelect,
        sortSelect,
      ),
      h('div', { class: 'flex items-center gap-2 border-b border-line px-4 py-1.5' }, this.selectAllBtn),
      this.listEl,
      // footer
      h(
        'div',
        { class: 'flex items-center gap-3 border-t border-line bg-surface px-5 py-3' },
        h('div', { class: 'flex flex-1 items-baseline gap-1.5' }, this.countEl, h('span', { class: 'text-[13px] text-muted' }, 'selected')),
        this.clearBtn,
        this.deleteBtn,
      ),
    );

    this.backdrop = h('div', {
      class: 'fixed inset-0 z-[2147483001] grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]',
      onclick: (e: Event) => {
        if (e.target === this.backdrop) this.close();
      },
    }, modal);
    this.layer.append(this.backdrop);
  }

  private onListClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('a')) return; // "open chat" link
    const row = target.closest<HTMLElement>('[data-id]');
    if (!row) return;
    const id = row.dataset.id!;
    if (this.hooks.isPending(id)) return;
    const willSelect = !this.selected.has(id);
    const ids = this.shown.filter((c) => !this.hooks.isPending(c.id));
    if (e.shiftKey && this.lastClickedId && this.lastClickedId !== id) {
      const a = ids.findIndex((c) => c.id === this.lastClickedId);
      const b = ids.findIndex((c) => c.id === id);
      if (a !== -1 && b !== -1) {
        for (const c of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) {
          if (willSelect) this.selected.set(c.id, c.title);
          else this.selected.delete(c.id);
        }
      }
    }
    const chat = this.chats.find((c) => c.id === id);
    if (willSelect) this.selected.set(id, chat?.title ?? 'Untitled chat');
    else this.selected.delete(id);
    this.lastClickedId = id;
    this.renderSelection();
  }

  private scheduleRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  private render() {
    if (!this.backdrop) return;
    // Drop selections that were deleted or queued meanwhile.
    for (const id of [...this.selected.keys()]) {
      if (this.hooks.isDeleted(id) || this.hooks.isPending(id)) this.selected.delete(id);
    }
    this.shown = this.filtered();

    // Status line
    const count = this.chats.filter((c) => !this.hooks.isDeleted(c.id)).length;
    this.statusEl.textContent = this.loading
      ? `Loading… ${plural(count, 'chat')}${this.total ? ` of ${this.total.toLocaleString()}` : ''}`
      : this.notice || `${plural(count, 'chat')}${this.fromSidebar ? ' in the sidebar' : ''}`;
    this.statusEl.classList.toggle('text-danger', !!this.notice && !this.loading);
    this.refreshBtn.disabled = this.loading;
    this.refreshBtn.firstElementChild?.classList.toggle('animate-spin', this.loading);

    // Rows
    if (!this.shown.length) {
      this.listEl.replaceChildren(
        h(
          'li',
          { class: 'grid h-full place-items-center p-10 text-center text-[14px] text-muted' },
          this.loading && !this.chats.length ? 'Loading your chats…' : this.chats.length ? 'No chats match these filters.' : 'No chats found.',
        ),
      );
    } else {
      this.listEl.replaceChildren(...this.shown.map((c) => this.row(c)));
    }
    this.renderSelection();
  }

  /** Cheap update after a selection change: row states, select-all and footer. */
  private renderSelection() {
    for (const li of this.listEl.children) {
      const id = (li as HTMLElement).dataset.id;
      if (!id) continue;
      const checked = this.selected.has(id);
      li.setAttribute('aria-selected', String(checked));
      const box = li.firstElementChild;
      if (box) setAttr(box, 'data-checked', checked);
    }

    // Select-all row
    const selectable = this.shown.filter((c) => !this.hooks.isPending(c.id));
    const nSel = selectable.filter((c) => this.selected.has(c.id)).length;
    setAttr(this.selectAllBox, 'data-checked', nSel > 0 && nSel === selectable.length);
    setAttr(this.selectAllBox, 'data-mixed', nSel > 0 && nSel < selectable.length);
    this.shownEl.textContent =
      this.query || this.age !== 'all' ? `Select all ${plural(selectable.length, 'match')}` : `Select all ${plural(selectable.length, 'chat')}`;
    this.selectAllBtn.disabled = !selectable.length;

    // Footer
    const n = this.selected.size;
    this.countEl.textContent = n.toLocaleString();
    this.clearBtn.disabled = n === 0;
    this.deleteBtn.disabled = n === 0;
    this.deleteBtn.lastElementChild!.textContent = n ? `Delete ${plural(n, 'chat')}` : 'Delete';
  }

  private row(c: ChatSummary) {
    const pending = this.hooks.isPending(c.id);
    const checked = this.selected.has(c.id);
    const box = h(
      'span',
      {
        class:
          'group mt-0.5 grid size-4 shrink-0 place-items-center rounded-check border-[1.5px] border-muted transition-colors ' +
          'data-checked:border-accent data-checked:bg-accent',
      },
      icon('check', 'size-3 text-accent-fg invisible group-data-checked:visible', 3.5),
    );
    setAttr(box, 'data-checked', checked);
    const date = c.updatedAt != null ? new Date(c.updatedAt) : null;
    const li = h(
      'li',
      {
        'data-id': c.id,
        role: 'option',
        'aria-selected': String(checked),
        'aria-disabled': pending ? 'true' : null,
        class:
          'group/row flex cursor-pointer items-start gap-3 border-b border-line/60 px-5 py-2.5 transition-colors ' +
          'hover:bg-surface-2 aria-selected:bg-accent/10 aria-disabled:cursor-default aria-disabled:opacity-50',
      },
      pending ? h('span', { class: 'mt-0.5 size-4 shrink-0' }) : box,
      h(
        'span',
        { class: `min-w-0 flex-1 text-[14px] leading-snug break-words ${pending ? 'line-through' : ''}` },
        c.title,
        pending ? h('span', { class: 'ml-2 inline-block rounded-full bg-surface-2 px-2 py-0.5 align-middle text-[11px] font-medium text-muted' }, 'Queued') : null,
      ),
      date
        ? h('span', { class: 'mt-0.5 shrink-0 text-[12px] text-muted tabular-nums', title: date.toLocaleString() }, relativeTime(c.updatedAt))
        : null,
      h('a', {
        href: `/c/${c.id}`,
        target: '_blank',
        rel: 'noopener',
        class: `${btn.icon} -my-1 size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100`,
        title: 'Open in new tab',
        'aria-label': `Open “${c.title}” in a new tab`,
      }, icon('external', 'size-3.5')),
    );
    return li;
  }
}

function setAttr(el: Element, name: string, on: boolean) {
  if (on) {
    if (!el.hasAttribute(name)) el.setAttribute(name, '');
  } else if (el.hasAttribute(name)) {
    el.removeAttribute(name);
  }
}
