import { CONFIG, queryFirst } from '../config';
import { runDeletion, type ChatRef, type FailedChat, type RunResult } from './deleter';
import { CHECK_SVG, h, shadowHost } from './dom';
import { clearQueue, loadStaleQueue, saveQueue } from './queue-store';
import { currentChatId, findScrollContainer, getChatRows, rowElement, sidebarNav, type ChatRow } from './sidebar';
import { APP_CSS, CHECKBOX_CSS, GLOBAL_CSS, TOGGLE_CSS } from './styles';

const OBSERVE: MutationObserverInit = { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] };

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

  private observer: MutationObserver | null = null;
  private scheduled = false;
  private globalStyle: HTMLStyleElement | null = null;
  private toggleHost: HTMLElement | null = null;
  private toggleBtn: HTMLButtonElement | null = null;
  private appHost: HTMLElement | null = null;
  private bar!: HTMLDivElement;
  private countEl!: HTMLSpanElement;
  private selectAllBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private deleteBtn!: HTMLButtonElement;
  private loadOlderBtn!: HTMLButtonElement;
  private filterInput!: HTMLInputElement;
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
    for (const attr of ['data-cbd-id', 'data-cbd-selected', 'data-cbd-dim', 'data-cbd-pending']) {
      document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
    }
    // Keep data-cbd-deleted rows hidden until ChatGPT re-renders them away, so
    // deleted chats never reappear; the global style stays for that reason only.
    this.toggleHost?.remove();
    this.appHost?.remove();
  }

  // ---- building UI --------------------------------------------------------

  private buildApp() {
    const { host, root } = shadowHost('div', APP_CSS, 'cbd-root');
    this.appHost = host;

    this.countEl = h('span', { class: 'count' }, '0 selected');
    this.loadOlderBtn = h('button', { class: 'link-btn', title: 'Scroll the sidebar to load older chats', onclick: () => this.toggleAutoScroll() }, 'Load older chats');
    this.filterInput = h('input', {
      type: 'text',
      placeholder: 'Filter by title…',
      'aria-label': 'Filter chats by title',
      oninput: () => {
        this.filter = this.filterInput.value.trim().toLowerCase();
        this.refresh();
      },
    });
    this.selectAllBtn = h('button', { onclick: () => this.selectAllVisible() }, 'Select all visible');
    this.clearBtn = h('button', { onclick: () => this.clearSelection() }, 'Clear');
    this.deleteBtn = h('button', { class: 'danger grow', onclick: () => this.openConfirm() }, 'Delete');

    this.bar = h(
      'div',
      { class: 'bar', role: 'toolbar', 'aria-label': 'Bulk delete', hidden: true },
      h('div', { class: 'row' }, h('span', { class: 'grow' }, this.countEl), this.loadOlderBtn),
      this.filterInput,
      h('div', { class: 'row' }, this.selectAllBtn, this.clearBtn, this.deleteBtn),
    );
    this.panel = h('div', { class: 'panel', role: 'status', 'aria-live': 'polite', hidden: true });
    this.modalLayer = h('div');
    root.append(this.bar, this.panel, this.modalLayer);
    document.body.append(host);
  }

  private ensureToggle() {
    if (!this.toggleHost) {
      const { host, root } = shadowHost('span', TOGGLE_CSS, 'cbd-toggle-host');
      this.toggleBtn = h('button', { 'aria-pressed': 'false', title: 'Select chats to delete (Esc to exit)', onclick: () => this.setSelectMode(!this.selectMode) });
      root.append(this.toggleBtn);
      this.toggleHost = host;
    }
    this.toggleBtn!.setAttribute('aria-pressed', String(this.selectMode));
    this.toggleBtn!.textContent = this.selectMode ? '✓ Done' : '☐ Select chats';

    const anchor = queryFirst<HTMLElement>(CONFIG.selectors.toggleAnchor);
    if (anchor?.parentElement) {
      if (this.toggleHost.nextElementSibling !== anchor) anchor.before(this.toggleHost);
      this.toggleHost.classList.remove('cbd-floating');
    } else if (document.querySelector(CONFIG.selectors.chatLink)) {
      // No known anchor: float the toggle near the sidebar instead.
      if (this.toggleHost.parentElement !== document.body) document.body.append(this.toggleHost);
      this.toggleHost.classList.add('cbd-floating');
    } else {
      this.toggleHost.remove();
    }
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
      const { host, root } = shadowHost('span', CHECKBOX_CSS);
      host.className = 'cbd-cb';
      const box = h('span', { class: 'box', role: 'checkbox' });
      box.innerHTML = CHECK_SVG;
      root.append(box);
      link.prepend(host);
      cb = host;
    }
    const checked = this.selected.has(id);
    setAttr(cb, 'data-checked', checked);
    cb.shadowRoot?.querySelector('.box')?.setAttribute('aria-checked', String(checked));
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
    const n = this.selected.size;
    this.countEl.textContent = `${n} selected`;
    this.deleteBtn.disabled = n === 0;
    this.deleteBtn.textContent = n ? `Delete ${n}` : 'Delete';
    this.clearBtn.disabled = n === 0;
    this.selectAllBtn.textContent = this.filter ? 'Select matches' : 'Select all visible';
    this.loadOlderBtn.textContent = this.autoScrolling ? 'Stop loading' : 'Load older chats';

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
      class: 'danger',
      disabled: typed,
      onclick: () => {
        this.closeConfirm();
        this.setSelectMode(false); // hand the sidebar back so ChatGPT can be used during the run
        this.enqueue(queue);
      },
    }, `Delete ${n}`);
    const cancelBtn = h('button', { onclick: () => this.closeConfirm() }, 'Cancel');
    const input = typed
      ? h('input', {
          type: 'text',
          placeholder: CONFIG.typedConfirmWord,
          'aria-label': `Type ${CONFIG.typedConfirmWord} to confirm`,
          autocomplete: 'off',
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
      { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('h2', {}, `Delete ${n} chat${n === 1 ? '' : 's'}?`),
      h('ul', { class: 'list' }, ...queue.map((c) => h('li', { title: c.title }, c.title))),
      h('div', { class: 'warn' }, 'This cannot be undone.'),
      h('div', { class: 'muted' }, 'Deletion runs in the background — you can keep using ChatGPT.'),
      ...(input ? [h('label', { class: 'muted' }, `Type ${CONFIG.typedConfirmWord} to confirm`), input] : []),
      h('div', { class: 'actions' }, cancelBtn, deleteBtn),
    );
    const backdrop = h('div', {
      class: 'backdrop',
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
      },
      onFailed: (chat) => {
        this.runDone++;
        this.runFailed.push(chat);
        void saveQueue(this.runQueue);
      },
    });

    clearInterval(this.heartbeat);
    this.running = false;
    if (!this.appHost?.isConnected) return; // extension was disabled mid-run; saved queue is kept for resume
    if (result.sessionExpired) await saveQueue(result.remaining, false);
    else await clearQueue();
    this.refresh();
    this.renderSummary({ ...result, deleted: this.runDeleted, failed: this.runFailed });
  }

  // ---- corner panel: resume / progress / summary --------------------------

  private showPanel(...children: (Node | null)[]) {
    this.panel.hidden = false;
    this.panel.classList.toggle('min', this.panelMinimized);
    this.panel.replaceChildren(...children.filter((c): c is Node => !!c));
  }

  private hidePanel() {
    this.panel.hidden = true;
    this.panel.replaceChildren();
  }

  private panelHeader(title: string, extra?: Node) {
    const minBtn = h('button', {
      class: 'icon-btn',
      title: this.panelMinimized ? 'Expand' : 'Minimize',
      'aria-label': this.panelMinimized ? 'Expand' : 'Minimize',
      onclick: () => {
        this.panelMinimized = !this.panelMinimized;
        if (this.running) this.renderRunning();
        else this.panel.classList.toggle('min', this.panelMinimized);
      },
    }, this.panelMinimized ? '▴' : '▾');
    return h('div', { class: 'panel-head' }, h('b', { class: 'grow' }, title), extra ?? null, minBtn);
  }

  private renderRunning() {
    const total = this.runDone + this.runQueue.length;
    const pct = total ? (this.runDone / total) * 100 : 0;
    const counter = h('span', { class: 'muted' }, `${this.runDone} / ${total}`);
    const fill = h('div', { style: `width:${pct}%` });
    const cancelBtn = h('button', {
      disabled: this.cancelRequested,
      onclick: () => {
        this.cancelRequested = true;
        this.renderRunning();
      },
    }, this.cancelRequested ? 'Cancelling…' : 'Cancel');

    this.showPanel(
      this.panelHeader('Deleting chats', counter),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(this.runDone) }, fill),
      h('div', { class: 'panel-body' },
        h('div', { class: 'current muted', title: this.currentTitle }, this.currentTitle),
        h('div', { class: 'row' }, h('span', { class: 'grow muted' }, 'You can keep using ChatGPT.'), cancelBtn),
      ),
    );
  }

  private renderSummary(r: RunResult) {
    const retryQueue = [...r.failed, ...r.remaining].map(({ id, title }) => ({ id, title }));
    const openChat = currentChatId();
    const openChatDeleted = !!openChat && this.deletedIds.has(openChat);
    const issues = r.failed.length || r.cancelled || r.sessionExpired;
    this.panelMinimized = false;

    let note: Node | null = null;
    if (r.sessionExpired) {
      note = h('div', { class: 'warn' }, 'Your ChatGPT session expired. Reload and sign in — you’ll be offered to resume the rest.');
    } else if (r.cancelled) {
      note = h('div', { class: 'muted' }, `Cancelled. ${r.remaining.length} chat${r.remaining.length === 1 ? ' was' : 's were'} not touched.`);
    }

    this.showPanel(
      this.panelHeader(issues ? 'Deletion finished with issues' : 'Deletion complete'),
      h('div', { class: 'panel-body' },
        h(
          'div',
          { class: 'stats' },
          h('div', {}, h('b', {}, String(r.deleted.length)), 'deleted'),
          h('div', {}, h('b', {}, String(r.failed.length)), 'failed'),
          r.remaining.length ? h('div', {}, h('b', {}, String(r.remaining.length)), 'not attempted') : null,
        ),
        note,
        r.failed.length
          ? h('ul', { class: 'list small' }, ...r.failed.map((f) => h('li', { title: `${f.title} — ${f.error}` }, f.title, h('span', { class: 'err' }, f.error))))
          : null,
        openChatDeleted ? h('div', { class: 'muted' }, 'The chat you have open was deleted.') : null,
        h(
          'div',
          { class: 'actions' },
          openChatDeleted ? h('button', { onclick: () => location.assign('/') }, 'New chat') : null,
          r.sessionExpired
            ? h('button', { class: 'danger', onclick: () => location.reload() }, 'Reload page')
            : retryQueue.length
              ? h('button', { class: 'danger', onclick: () => this.enqueue(retryQueue) }, `Retry ${retryQueue.length}`)
              : null,
          h('button', { onclick: () => this.hidePanel() }, 'Dismiss'),
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
      this.panelHeader('Unfinished deletion'),
      h('div', { class: 'panel-body' },
        h('div', {}, `${n} chat${n === 1 ? ' was' : 's were'} still queued for deletion when the page closed.`),
        h('ul', { class: 'list small' }, ...items.map((c) => h('li', { title: c.title }, c.title))),
        h(
          'div',
          { class: 'actions' },
          h('button', {
            onclick: () => {
              void clearQueue();
              this.hidePanel();
            },
          }, 'Discard'),
          h('button', { class: 'danger', onclick: () => this.enqueue(items) }, `Resume ${n}`),
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
