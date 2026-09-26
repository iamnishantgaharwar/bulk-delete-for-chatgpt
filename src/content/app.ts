import { CONFIG, queryFirst } from '../config';
import { runDeletion, type ChatRef, type FailedChat, type RunResult } from './deleter';
import { btn, h, icon, shadowHost } from './dom';
import { clearQueue, loadStaleQueue, saveQueue } from './queue-store';
import { currentChatId, findScrollContainer, getChatRows, rowElement, sidebarNav, type ChatRow } from './sidebar';
import { GLOBAL_CSS } from './styles';

const OBSERVE: MutationObserverInit = { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface RunView {
  counter: HTMLElement;
  fill: HTMLElement;
  current: HTMLElement;
  cancelBtn: HTMLButtonElement;
}

export class BulkDeleteApp {
  private selectMode = false;
  /** Selected chats, keyed by conversation ID captured at selection time. */
  private selected = new Map<string, string>();
  private deletedIds = new Set<string>();
  private lastClickedId: string | null = null;
  private filter = '';
  private confirmOpen = false;
  private autoScrolling = false;

  // Background deletion state. The queue is consumed by runDeletion and can be
  // appended to while it runs, so the user can keep queueing chats.
  private runQueue: ChatRef[] = [];
  private running = false;
  private cancelRequested = false;
  private runDone = 0;
  private runDeleted: ChatRef[] = [];
  private runFailed: FailedChat[] = [];
  private currentTitle = '';
  private heartbeat: number | undefined;
  private panelMinimized = false;
  private runView: RunView | null = null;

  private observer: MutationObserver | null = null;
  private scheduled = false;
  private globalStyle: HTMLStyleElement | null = null;
  private toggleHost: HTMLElement | null = null;
  private toggleBtn: HTMLButtonElement | null = null;
  private toggleLabel: HTMLSpanElement | null = null;
  private appHost: HTMLElement | null = null;
  private bar!: HTMLDivElement;
  private countEl!: HTMLSpanElement;
  private selectAllBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private deleteBtn!: HTMLButtonElement;
  private deleteLabel!: HTMLSpanElement;
  private loadOlderBtn!: HTMLButtonElement;
  private loadOlderLabel!: HTMLSpanElement;
  private filterInput!: HTMLInputElement;
  private filterClearBtn!: HTMLButtonElement;
  private modalLayer!: HTMLDivElement;
  private panel!: HTMLDivElement;

  // ---- lifecycle ----------------------------------------------------------

  mount() {
    this.globalStyle = h('style', { id: 'cbd-global-style' }, GLOBAL_CSS);
    document.head.append(this.globalStyle);
    this.buildApp();

    document.addEventListener('click', this.onDocClick, true);
    document.addEventListener('pointerdown', this.onDocPointer, true);
    document.addEventListener('mousedown', this.onDocPointer, true);
    document.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('resize', this.schedule);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    window.addEventListener('pagehide', this.onPageHide);

    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(document.body, OBSERVE);
    this.refresh();
    this.offerResume();
  }

  unmount() {
    // Stops after the in-flight request; the saved queue stays so it can be resumed.
    this.cancelRequested = true;
    this.autoScrolling = false;
    clearInterval(this.heartbeat);
    this.observer?.disconnect();
    document.removeEventListener('click', this.onDocClick, true);
    document.removeEventListener('pointerdown', this.onDocPointer, true);
    document.removeEventListener('mousedown', this.onDocPointer, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('resize', this.schedule);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    window.removeEventListener('pagehide', this.onPageHide);
    document.documentElement.removeAttribute('data-cbd-select');
    document.querySelectorAll('.cbd-cb').forEach((el) => el.remove());
    document.documentElement.style.removeProperty('--cbd-bar-space');
    for (const attr of ['data-cbd-id', 'data-cbd-selected', 'data-cbd-dim', 'data-cbd-pending', 'data-cbd-scroll-pad']) {
      document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
    }
    // Keep data-cbd-deleted rows hidden until ChatGPT re-renders them away, so
    // deleted chats never reappear; the global style stays for that reason only.
    this.toggleHost?.remove();
    this.appHost?.remove();
  }

  // ---- building UI --------------------------------------------------------

  private buildApp() {
    const { host, root } = shadowHost('div', 'cbd-root');
    this.appHost = host;

    this.countEl = h('span', { class: 'text-[15px] font-semibold tabular-nums' }, '0');
    this.clearBtn = h('button', { class: `${btn.ghost} px-2.5 py-1`, onclick: () => this.clearSelection() }, 'Clear');

    this.filterInput = h('input', {
      type: 'text',
      placeholder: 'Filter by title',
      'aria-label': 'Filter chats by title',
      class: 'min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-muted',
      oninput: () => this.setFilter(this.filterInput.value),
    });
    this.filterClearBtn = h('button', {
      class: `${btn.icon} size-5`,
      'aria-label': 'Clear filter',
      hidden: true,
      onclick: () => {
        this.setFilter('');
        this.filterInput.focus();
      },
    }, icon('x', 'size-3.5'));

    this.selectAllBtn = h('button', {
      class: `${btn.secondary} flex-1`,
      title: 'Select every chat currently shown (Ctrl/⌘ A)',
      onclick: () => this.selectAllVisible(),
    }, 'Select all');
    this.loadOlderLabel = h('span', {}, 'Older');
    this.loadOlderBtn = h('button', {
      class: btn.secondary,
      title: 'Scroll the sidebar to load older chats',
      onclick: () => this.toggleAutoScroll(),
    }, icon('arrowDown', 'size-3.5'), this.loadOlderLabel);
    this.deleteLabel = h('span', {}, 'Delete');
    this.deleteBtn = h('button', { class: `${btn.danger} w-full py-2`, onclick: () => this.openConfirm() }, icon('trash'), this.deleteLabel);

    this.bar = h(
      'div',
      {
        class: 'animate-in fixed bottom-3 z-[2147483000] flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3 shadow-float',
        role: 'toolbar',
        'aria-label': 'Bulk delete',
        hidden: true,
      },
      h(
        'div',
        { class: 'flex items-center justify-between gap-2 pl-1' },
        h('div', { class: 'flex items-baseline gap-1.5' }, this.countEl, h('span', { class: 'text-[13px] text-muted' }, 'selected')),
        this.clearBtn,
      ),
      h(
        'label',
        {
          class:
            'flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-1.5 text-muted ' +
            'focus-within:outline-2 focus-within:outline-ring',
        },
        icon('search', 'size-4'),
        this.filterInput,
        this.filterClearBtn,
      ),
      h('div', { class: 'flex gap-2' }, this.selectAllBtn, this.loadOlderBtn),
      this.deleteBtn,
    );
    this.panel = h('div', {
      class:
        'group animate-in fixed right-4 bottom-4 z-[2147483000] w-80 max-w-[calc(100vw-2rem)] overflow-hidden ' +
        'rounded-2xl border border-line bg-surface shadow-float data-min:w-64',
      role: 'status',
      'aria-live': 'polite',
      hidden: true,
    });
    this.modalLayer = h('div');
    root.append(this.bar, this.panel, this.modalLayer);
    document.body.append(host);
  }

  private ensureToggle() {
    if (!this.toggleHost) {
      const { host, root } = shadowHost('span', 'cbd-toggle-host');
      this.toggleLabel = h('span', {}, 'Bulk delete chats');
      this.toggleBtn = h('button', {
        class:
          'inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-line bg-surface ' +
          'py-1.5 pr-3.5 pl-3 text-[13px] font-medium text-fg shadow-xs transition-colors ' +
          'hover:border-muted hover:bg-surface-2 ' +
          'aria-pressed:border-fg aria-pressed:bg-fg aria-pressed:text-surface aria-pressed:hover:opacity-90 ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
          'data-floating:shadow-float',
        'aria-pressed': 'false',
        title: 'Select chats to delete (Esc to exit)',
        onclick: () => this.setSelectMode(!this.selectMode),
      },
        this.toggleLabel,
      );
      root.append(this.toggleBtn);
      this.toggleHost = host;
    }
    this.toggleBtn!.setAttribute('aria-pressed', String(this.selectMode));
    this.toggleLabel!.textContent = this.selectMode ? 'Done' : 'Bulk delete chats';
    const iconName = this.selectMode ? 'check' : 'listCheck';
    if (this.toggleBtn!.dataset.icon !== iconName) {
      this.toggleBtn!.dataset.icon = iconName;
      this.toggleBtn!.firstElementChild?.matches('[aria-hidden]') && this.toggleBtn!.firstElementChild.remove();
      this.toggleBtn!.prepend(icon(iconName, 'size-4', this.selectMode ? 2.5 : 2));
    }

    const anchor = queryFirst<HTMLElement>(CONFIG.selectors.toggleAnchor);
    let floating = false;
    if (anchor?.parentElement) {
      if (this.toggleHost.nextElementSibling !== anchor) anchor.before(this.toggleHost);
    } else if (document.querySelector(CONFIG.selectors.chatLink)) {
      // No known anchor: float the toggle near the sidebar instead.
      if (this.toggleHost.parentElement !== document.body) document.body.append(this.toggleHost);
      floating = true;
    } else {
      this.toggleHost.remove();
    }
    this.toggleHost.classList.toggle('cbd-floating', floating);
    setAttr(this.toggleBtn!, 'data-floating', floating);
  }

  // ---- sidebar sync -------------------------------------------------------

  private schedule = () => {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.refresh();
    });
  };

  /** Idempotent: re-attaches checkboxes and row state after ChatGPT re-renders. */
  private refresh() {
    this.observer?.disconnect();
    try {
      this.ensureToggle();
      const pending = this.pendingIds();
      for (const row of getChatRows()) this.syncRow(row, pending);
      this.updateBar();
    } finally {
      this.observer?.observe(document.body, OBSERVE);
    }
  }

  private pendingIds() {
    return new Set(this.runQueue.map((c) => c.id));
  }

  private syncRow({ id, link, eligible, title }: ChatRow, pending: Set<string>) {
    const rowEl = rowElement(link);
    let cb = link.querySelector<HTMLElement>(':scope > .cbd-cb');

    if (!eligible) {
      cb?.remove();
      link.removeAttribute('data-cbd-id');
      rowEl.removeAttribute('data-cbd-selected');
      return;
    }

    setAttr(rowEl, 'data-cbd-deleted', this.deletedIds.has(id));
    setAttr(rowEl, 'data-cbd-pending', pending.has(id));
    if (link.getAttribute('data-cbd-id') !== id) link.setAttribute('data-cbd-id', id);
    if (!cb) {
      const { host, root } = shadowHost('span');
      host.className = 'cbd-cb';
      root.append(
        h(
          'span',
          {
            class:
              'group grid size-4 place-items-center rounded-[5px] border-[1.5px] border-muted transition-colors ' +
              'data-checked:border-fg data-checked:bg-fg',
            role: 'checkbox',
          },
          icon('check', 'size-3 text-surface invisible group-data-checked:visible', 3.5),
        ),
      );
      link.prepend(host);
      cb = host;
    }
    const checked = this.selected.has(id);
    const box = cb.shadowRoot?.querySelector('[role="checkbox"]');
    if (box) {
      setAttr(box, 'data-checked', checked);
      box.setAttribute('aria-checked', String(checked));
    }
    setAttr(rowEl, 'data-cbd-selected', this.selectMode && checked);
    setAttr(rowEl, 'data-cbd-dim', this.selectMode && !!this.filter && !title.toLowerCase().includes(this.filter));
  }

  /** Rows that can be ticked: eligible, not deleted or already queued, matching the filter. */
  private selectableRows(): ChatRow[] {
    const pending = this.pendingIds();
    return getChatRows().filter(
      (r) =>
        r.eligible &&
        !this.deletedIds.has(r.id) &&
        !pending.has(r.id) &&
        (!this.filter || r.title.toLowerCase().includes(this.filter)),
    );
  }

  private updateBar() {
    this.bar.hidden = !this.selectMode;
    if (!this.selectMode) return;
    this.reserveSidebarSpace();
    const n = this.selected.size;
    this.countEl.textContent = String(n);
    this.deleteBtn.disabled = n === 0;
    this.deleteLabel.textContent = n ? `Delete ${plural(n, 'chat')}` : 'Delete';
    this.clearBtn.disabled = n === 0;
    this.selectAllBtn.textContent = this.filter ? 'Select matches' : 'Select all';
    this.loadOlderLabel.textContent = this.autoScrolling ? 'Stop' : 'Older';
    this.filterClearBtn.hidden = !this.filter;

    // Sit at the bottom of the sidebar when it's open; otherwise bottom-left of the page.
    const nav = sidebarNav();
    const rect = nav?.getBoundingClientRect();
    if (rect && rect.width >= 200 && rect.left >= 0) {
      this.bar.style.left = `${rect.left + 8}px`;
      this.bar.style.width = `${rect.width - 16}px`;
    } else {
      this.bar.style.left = '12px';
      this.bar.style.width = '280px';
    }
  }

  /** Pads the sidebar's scroll area so no chat row is stuck behind the action bar. */
  private reserveSidebarSpace() {
    const scroller = findScrollContainer(false);
    if (!scroller) return;
    if (!scroller.hasAttribute('data-cbd-scroll-pad')) {
      document.querySelectorAll('[data-cbd-scroll-pad]').forEach((el) => el.removeAttribute('data-cbd-scroll-pad'));
      scroller.setAttribute('data-cbd-scroll-pad', '');
    }
    const space = `${this.bar.offsetHeight + 24}px`;
    if (document.documentElement.style.getPropertyValue('--cbd-bar-space') !== space) {
      document.documentElement.style.setProperty('--cbd-bar-space', space);
    }
  }

  // ---- selection ----------------------------------------------------------

  setSelectMode(on: boolean) {
    if (!on && this.confirmOpen) return;
    this.selectMode = on;
    setAttr(document.documentElement, 'data-cbd-select', on);
    if (!on) {
      this.selected.clear();
      this.lastClickedId = null;
      this.filter = '';
      this.filterInput.value = '';
      this.autoScrolling = false;
    }
    this.refresh();
  }

  private setFilter(value: string) {
    this.filterInput.value = value;
    this.filter = value.trim().toLowerCase();
    this.refresh();
  }

  private toggleChat(id: string, title: string, shift: boolean) {
    const selectable = this.selectableRows();
    if (!selectable.some((r) => r.id === id) && !this.selected.has(id)) return; // queued or filtered out
    const willSelect = !this.selected.has(id);
    if (shift && this.lastClickedId && this.lastClickedId !== id) {
      const rows = getChatRows().filter((r) => r.eligible && !this.deletedIds.has(r.id));
      const a = rows.findIndex((r) => r.id === this.lastClickedId);
      const b = rows.findIndex((r) => r.id === id);
      if (a !== -1 && b !== -1) {
        const allowed = new Set(selectable.map((r) => r.id));
        for (const r of rows.slice(Math.min(a, b), Math.max(a, b) + 1)) {
          if (willSelect && allowed.has(r.id)) this.selected.set(r.id, r.title);
          else if (!willSelect) this.selected.delete(r.id);
        }
      }
    }
    if (willSelect) this.selected.set(id, title);
    else this.selected.delete(id);
    this.lastClickedId = id;
    this.refresh();
  }

  private selectAllVisible() {
    for (const r of this.selectableRows()) this.selected.set(r.id, r.title);
    this.refresh();
  }

  private clearSelection() {
    this.selected.clear();
    this.lastClickedId = null;
    this.refresh();
  }

  private async toggleAutoScroll() {
    if (this.autoScrolling) {
      this.autoScrolling = false;
      this.updateBar();
      return;
    }
    const scroller = findScrollContainer();
    if (!scroller) return;
    this.autoScrolling = true;
    this.updateBar();
    let idle = 0;
    let lastCount = getChatRows().length;
    for (let round = 0; this.autoScrolling && round < CONFIG.autoScrollMaxRounds && idle < CONFIG.autoScrollIdleRounds; round++) {
      scroller.scrollTop = scroller.scrollHeight;
      await new Promise((r) => setTimeout(r, CONFIG.autoScrollDelayMs));
      const count = getChatRows().length;
      idle = count > lastCount ? 0 : idle + 1;
      lastCount = count;
    }
    this.autoScrolling = false;
    this.updateBar();
  }

  // ---- event interception -------------------------------------------------

  private linkFromEvent(e: Event): HTMLAnchorElement | null {
    // Synthetic events come from the UI-automation fallback — let those through.
    if (!this.selectMode || !e.isTrusted) return null;
    const target = e.target as Element | null;
    return target?.closest?.<HTMLAnchorElement>('a[data-cbd-id]') ?? null;
  }

  private onDocPointer = (e: Event) => {
    if (!this.linkFromEvent(e)) return;
    // Stop ChatGPT's row handlers (e.g. the ⋯ menu) and text selection on shift-click.
    e.stopPropagation();
    if (e.type === 'mousedown') e.preventDefault();
  };

  private onDocClick = (e: MouseEvent) => {
    const link = this.linkFromEvent(e);
    if (!link) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const id = link.getAttribute('data-cbd-id')!;
    const row = getChatRows().find((r) => r.link === link);
    this.toggleChat(id, row?.title ?? 'Untitled chat', e.shiftKey);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (this.confirmOpen) this.closeConfirm();
      else if (this.selectMode) this.setSelectMode(false);
      else return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (this.selectMode && !this.confirmOpen && (e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey)) {
      const origin = e.composedPath()[0] as HTMLElement | undefined;
      if (origin && (origin.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(origin.tagName))) return;
      e.preventDefault();
      e.stopPropagation();
      this.selectAllVisible();
    }
  };

  private onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (this.running) {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  /** The tab is going away: release the saved queue so the next page load can offer to resume it. */
  private onPageHide = () => {
    if (this.running) void saveQueue(this.runQueue, false);
  };

  // ---- confirm modal ------------------------------------------------------

  private closeConfirm() {
    this.modalLayer.replaceChildren();
    this.confirmOpen = false;
  }

  private openConfirm() {
    const queue = [...this.selected].map(([id, title]) => ({ id, title }));
    if (!queue.length) return;
    this.confirmOpen = true;
    const n = queue.length;
    const typed = n > CONFIG.typedConfirmThreshold;
    const deleteBtn = h('button', {
      class: btn.danger,
      disabled: typed,
      onclick: () => {
        this.closeConfirm();
        this.setSelectMode(false); // hand the sidebar back so ChatGPT can be used during the run
        this.enqueue(queue);
      },
    }, `Delete ${plural(n, 'chat')}`);
    const cancelBtn = h('button', { class: btn.secondary, onclick: () => this.closeConfirm() }, 'Cancel');
    const input = typed
      ? h('input', {
          type: 'text',
          placeholder: CONFIG.typedConfirmWord,
          'aria-label': `Type ${CONFIG.typedConfirmWord} to confirm`,
          autocomplete: 'off',
          spellcheck: 'false',
          class:
            'w-full rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-[13px] tracking-wider text-fg ' +
            'outline-none placeholder:text-muted/60 focus:outline-2 focus:outline-ring',
          oninput: (e: Event) => {
            deleteBtn.disabled = (e.target as HTMLInputElement).value.trim() !== CONFIG.typedConfirmWord;
          },
          onkeydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !deleteBtn.disabled) deleteBtn.click();
          },
        })
      : null;

    const modal = h(
      'div',
      {
        class:
          'animate-in flex max-h-[min(640px,100%)] w-[min(440px,100%)] flex-col gap-4 rounded-3xl border border-line ' +
          'bg-surface p-6 text-fg shadow-float',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'cbd-confirm-title',
      },
      h(
        'div',
        { class: 'flex gap-3.5' },
        h('div', { class: 'grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger' }, icon('trash', 'size-5')),
        h(
          'div',
          { class: 'flex flex-col gap-1' },
          h('h2', { id: 'cbd-confirm-title', class: 'text-[17px] font-semibold' }, `Delete ${plural(n, 'chat')}?`),
          h('p', { class: 'text-[13px] text-muted' }, 'This can’t be undone. Deletion runs in the background, so you can keep using ChatGPT.'),
        ),
      ),
      h(
        'ul',
        { class: 'max-h-64 min-h-12 divide-y divide-line overflow-auto rounded-xl border border-line' },
        ...queue.map((c) => h('li', { class: 'truncate px-3 py-2 text-[13px]', title: c.title }, c.title)),
      ),
      input
        ? h(
            'label',
            { class: 'flex flex-col gap-1.5 text-[13px] text-muted' },
            h('span', {}, 'Type ', h('b', { class: 'font-mono font-semibold text-fg' }, CONFIG.typedConfirmWord), ' to confirm'),
            input,
          )
        : null,
      h('div', { class: 'flex justify-end gap-2' }, cancelBtn, deleteBtn),
    );
    const backdrop = h('div', {
      class: 'fixed inset-0 z-[2147483001] grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]',
      onclick: (e: Event) => {
        if (e.target === backdrop) this.closeConfirm();
      },
    }, modal);
    this.modalLayer.replaceChildren(backdrop);
    (input ?? cancelBtn).focus();
  }

  // ---- background run -----------------------------------------------------

  /** Adds already-confirmed chats to the background queue, starting a run if idle. */
  private enqueue(chats: ChatRef[]) {
    const pending = this.pendingIds();
    const fresh = chats.filter((c) => !pending.has(c.id) && !this.deletedIds.has(c.id));
    if (!fresh.length) return;
    this.runQueue.push(...fresh);
    void saveQueue(this.runQueue);
    this.refresh();
    if (this.running) this.renderRunning();
    else void this.startRun();
  }

  private async startRun() {
    this.running = true;
    this.cancelRequested = false;
    this.runDone = 0;
    this.runDeleted = [];
    this.runFailed = [];
    this.currentTitle = 'Starting…';
    this.renderRunning();
    this.heartbeat = window.setInterval(() => void saveQueue(this.runQueue), CONFIG.queueHeartbeatMs);

    const result = await runDeletion(this.runQueue, {
      isCancelled: () => this.cancelRequested,
      onStart: (chat) => {
        this.currentTitle = chat.title;
        this.renderRunning();
      },
      onDeleted: (chat) => {
        this.runDone++;
        this.runDeleted.push(chat);
        this.deletedIds.add(chat.id);
        this.selected.delete(chat.id);
        void saveQueue(this.runQueue);
        this.refresh();
        this.renderRunning();
      },
      onFailed: (chat) => {
        this.runDone++;
        this.runFailed.push(chat);
        void saveQueue(this.runQueue);
        this.renderRunning();
      },
    });

    clearInterval(this.heartbeat);
    this.running = false;
    this.runView = null;
    if (!this.appHost?.isConnected) return; // extension was disabled mid-run; saved queue is kept for resume
    if (result.sessionExpired) await saveQueue(result.remaining, false);
    else await clearQueue();
    this.refresh();
    this.renderSummary({ ...result, deleted: this.runDeleted, failed: this.runFailed });
  }

  // ---- corner panel: resume / progress / summary --------------------------

  private showPanel(...children: (Node | null)[]) {
    this.panel.hidden = false;
    setAttr(this.panel, 'data-min', this.panelMinimized);
    this.panel.replaceChildren(...children.filter((c): c is Node => !!c));
  }

  private hidePanel() {
    this.panel.hidden = true;
    this.panel.replaceChildren();
    this.runView = null;
  }

  /** Header row: status badge, title, optional trailing info, minimize button. */
  private panelHeader(badge: Node, title: string, extra?: Node) {
    const minIcon = () => icon(this.panelMinimized ? 'chevronUp' : 'chevronDown', 'size-4');
    const minBtn = h('button', {
      class: btn.icon,
      'aria-label': this.panelMinimized ? 'Expand' : 'Minimize',
      onclick: () => {
        this.panelMinimized = !this.panelMinimized;
        setAttr(this.panel, 'data-min', this.panelMinimized);
        minBtn.setAttribute('aria-label', this.panelMinimized ? 'Expand' : 'Minimize');
        minBtn.replaceChildren(minIcon());
      },
    }, minIcon());
    return h(
      'div',
      { class: 'flex items-center gap-2.5 px-4 pt-3 pb-2 group-data-min:pb-3' },
      badge,
      h('b', { class: 'min-w-0 flex-1 truncate text-[14px] font-semibold' }, title),
      extra ?? null,
      minBtn,
    );
  }

  private panelBody(...children: (Node | null)[]) {
    return h('div', { class: 'flex flex-col gap-3 px-4 pt-1 pb-4 group-data-min:hidden' }, ...children);
  }

  private statusBadge(kind: 'spinner' | 'success' | 'warning' | 'info') {
    if (kind === 'spinner') {
      return h('span', { class: 'size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-fg', 'aria-hidden': 'true' });
    }
    const styles = {
      success: ['check', 'bg-success text-white'],
      warning: ['alert', 'bg-danger-soft text-danger'],
      info: ['history', 'bg-surface-2 text-fg'],
    } as const;
    const [name, cls] = styles[kind];
    return h('span', { class: `grid size-6 shrink-0 place-items-center rounded-full ${cls}` }, icon(name, 'size-3.5', 2.5));
  }

  private renderRunning() {
    const total = this.runDone + this.runQueue.length;
    if (!this.runView) {
      const counter = h('span', { class: 'text-[13px] text-muted tabular-nums' });
      const fill = h('div', { class: 'h-full rounded-full bg-fg transition-[width] duration-300 ease-out', style: 'width:0%' });
      const current = h('div', { class: 'truncate text-[13px] text-muted' });
      const cancelBtn = h('button', {
        class: `${btn.secondary} px-3 py-1`,
        onclick: () => {
          this.cancelRequested = true;
          this.renderRunning();
        },
      }, 'Cancel');
      this.runView = { counter, fill, current, cancelBtn };
      this.showPanel(
        this.panelHeader(this.statusBadge('spinner'), 'Deleting chats', counter),
        h('div', { class: 'mx-4 mb-2 h-1.5 overflow-hidden rounded-full bg-surface-2 group-data-min:mb-3', role: 'progressbar', 'aria-valuemin': '0' }, fill),
        this.panelBody(
          current,
          h('div', { class: 'flex items-center gap-2' }, h('span', { class: 'flex-1 text-[12px] text-muted' }, 'You can keep using ChatGPT.'), cancelBtn),
        ),
      );
    }
    const { counter, fill, current, cancelBtn } = this.runView;
    counter.textContent = `${this.runDone} / ${total}`;
    fill.style.width = `${total ? (this.runDone / total) * 100 : 0}%`;
    fill.parentElement?.setAttribute('aria-valuemax', String(total));
    fill.parentElement?.setAttribute('aria-valuenow', String(this.runDone));
    current.textContent = this.currentTitle;
    current.title = this.currentTitle;
    cancelBtn.disabled = this.cancelRequested;
    cancelBtn.textContent = this.cancelRequested ? 'Cancelling…' : 'Cancel';
  }

  private stat(value: number, label: string, tone = '') {
    return h(
      'div',
      { class: 'flex flex-col rounded-xl bg-surface-2 px-3 py-2' },
      h('span', { class: `text-lg font-semibold tabular-nums ${tone}` }, String(value)),
      h('span', { class: 'text-[12px] text-muted' }, label),
    );
  }

  private renderSummary(r: RunResult) {
    const retryQueue = [...r.failed, ...r.remaining].map(({ id, title }) => ({ id, title }));
    const openChat = currentChatId();
    const openChatDeleted = !!openChat && this.deletedIds.has(openChat);
    const issues = r.failed.length > 0 || r.cancelled || r.sessionExpired;
    this.panelMinimized = false;

    let note: Node | null = null;
    if (r.sessionExpired) {
      note = h('p', { class: 'text-[13px] text-danger' }, 'Your ChatGPT session expired. Reload and sign in — you’ll be offered to resume the rest.');
    } else if (r.cancelled) {
      note = h('p', { class: 'text-[13px] text-muted' }, `Cancelled. ${plural(r.remaining.length, 'chat')} ${r.remaining.length === 1 ? 'was' : 'were'} not touched.`);
    }

    this.showPanel(
      this.panelHeader(this.statusBadge(issues ? 'warning' : 'success'), issues ? 'Finished with issues' : 'Deletion complete'),
      this.panelBody(
        h(
          'div',
          { class: `grid gap-2 ${r.remaining.length ? 'grid-cols-3' : 'grid-cols-2'}` },
          this.stat(r.deleted.length, 'deleted', 'text-success'),
          this.stat(r.failed.length, 'failed', r.failed.length ? 'text-danger' : ''),
          r.remaining.length ? this.stat(r.remaining.length, 'skipped') : null,
        ),
        note,
        r.failed.length
          ? h(
              'ul',
              { class: 'max-h-32 divide-y divide-line overflow-auto rounded-xl border border-line' },
              ...r.failed.map((f) =>
                h(
                  'li',
                  { class: 'flex items-center gap-2 px-3 py-1.5 text-[13px]', title: `${f.title} — ${f.error}` },
                  h('span', { class: 'min-w-0 flex-1 truncate' }, f.title),
                  h('span', { class: 'shrink-0 text-[12px] text-danger' }, f.error),
                ),
              ),
            )
          : null,
        openChatDeleted ? h('p', { class: 'text-[13px] text-muted' }, 'The chat you have open was deleted.') : null,
        h(
          'div',
          { class: 'flex flex-wrap justify-end gap-2' },
          h('button', { class: btn.ghost, onclick: () => this.hidePanel() }, 'Dismiss'),
          openChatDeleted ? h('button', { class: btn.secondary, onclick: () => location.assign('/') }, 'New chat') : null,
          r.sessionExpired
            ? h('button', { class: btn.primary, onclick: () => location.reload() }, icon('refresh', 'size-3.5'), 'Reload page')
            : retryQueue.length
              ? h('button', { class: btn.danger, onclick: () => this.enqueue(retryQueue) }, icon('refresh', 'size-3.5'), `Retry ${retryQueue.length}`)
              : null,
        ),
      ),
    );
  }

  private async offerResume() {
    const items = await loadStaleQueue().catch(() => null);
    if (!items?.length || this.running || !this.appHost?.isConnected) return;
    const n = items.length;
    this.panelMinimized = false;
    this.showPanel(
      this.panelHeader(this.statusBadge('info'), 'Unfinished deletion'),
      this.panelBody(
        h('p', { class: 'text-[13px] text-muted' }, `${plural(n, 'chat')} ${n === 1 ? 'was' : 'were'} still queued when the page closed.`),
        h(
          'ul',
          { class: 'max-h-32 divide-y divide-line overflow-auto rounded-xl border border-line' },
          ...items.map((c) => h('li', { class: 'truncate px-3 py-1.5 text-[13px]', title: c.title }, c.title)),
        ),
        h(
          'div',
          { class: 'flex justify-end gap-2' },
          h('button', {
            class: btn.ghost,
            onclick: () => {
              void clearQueue();
              this.hidePanel();
            },
          }, 'Discard'),
          h('button', { class: btn.danger, onclick: () => this.enqueue(items) }, `Resume ${n}`),
        ),
      ),
    );
  }
}

function setAttr(el: Element, name: string, on: boolean) {
  if (on) {
    if (!el.hasAttribute(name)) el.setAttribute(name, '');
  } else if (el.hasAttribute(name)) {
    el.removeAttribute(name);
  }
}
