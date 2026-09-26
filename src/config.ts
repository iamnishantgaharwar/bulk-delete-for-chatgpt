// Every ChatGPT-specific selector and endpoint lives here, so a ChatGPT UI or
// API change is a one-file fix. Selector lists are tried in order.
//
// NOTE: the endpoint and payload below match what ChatGPT's own "Delete" action
// has been observed to send (PATCH /backend-api/conversation/<id> with
// {"is_visible": false}). Re-verify against live network traffic before release.

export const CONFIG = {
  endpoints: {
    session: '/api/auth/session',
    conversation: (id: string) => `/backend-api/conversation/${encodeURIComponent(id)}`,
    /** The paginated list ChatGPT's sidebar itself loads (newest first). */
    conversations: (offset: number, limit: number) =>
      `/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated`,
  },
  /** Project chats are out of scope for v1; the list API tags them with a g-p-* gizmo id. */
  isProjectConversation: (gizmoId: string | null | undefined) => !!gizmoId && gizmoId.startsWith('g-p-'),
  deletePayload: { is_visible: false },

  /** Delay between deletions (ms). */
  throttleMs: 500,
  /** Retries on HTTP 429 / 5xx / network error, with exponential backoff. */
  maxRetries: 4,
  backoffBaseMs: 1000,
  backoffMaxMs: 30_000,

  /** Where the "Manage chats" button sits — below ChatGPT's header so it doesn't cover its buttons. */
  managerButton: { top: '64px', right: '20px' },
  /** Chat manager: page size and pause between pages when loading the full history. */
  listPageSize: 100,
  listPageDelayMs: 300,
  /** Safety cap on history loading (pages × page size). */
  listMaxPages: 100,

  /** A saved queue whose tab hasn't reported in this long is offered for resume. */
  queueHeartbeatMs: 3000,
  queueStaleMs: 15_000,

  /** Above this many chats the confirm modal requires typing the confirm word. */
  typedConfirmThreshold: 20,
  typedConfirmWord: 'DELETE',

  /** Auto-scroll ("Load older chats"): stop after this many rounds with no new rows. */
  autoScrollIdleRounds: 3,
  autoScrollDelayMs: 900,
  autoScrollMaxRounds: 200,

  /**
   * Only top-level chats (/c/<id>) are eligible. Project chats live under
   * /g/<project>/c/<id> and are shown without checkboxes in v1.
   */
  chatPathPattern: /^\/c\/([0-9a-zA-Z-]{8,})\/?$/,

  selectors: {
    /** Links to chats in the sidebar. Eligibility is decided by chatPathPattern. */
    chatLink: 'nav a[href*="/c/"]',
    /** Element inside a chat link that holds just the title text. */
    chatTitle: ['[dir="auto"]', '.truncate'],
    /** Where to insert the Select toggle (inserted before the first match). */
    toggleAnchor: ['nav #history', 'nav [data-testid="history"]', 'nav aside'],
    /** Rows to exclude even when their URL looks eligible (e.g. pinned chats). */
    excludedRow: ['[data-testid*="pinned"]', '[data-pinned="true"]'],

    // UI-automation fallback (method B)
    rowOptionsButton: [
      'button[data-testid$="-options"]',
      'button[aria-label*="options" i]',
      'button[aria-haspopup="menu"]',
    ],
    menuItem: '[role="menuitem"]',
    deleteMenuItemText: /^delete$/i,
    confirmDeleteButton: [
      '[data-testid="delete-conversation-confirm-button"]',
      '[role="dialog"] button.btn-danger',
    ],
  },

  /** ChatGPT marks dark mode with this class on <html>. */
  darkThemeClass: 'dark',
} as const;

export function queryFirst<T extends Element = Element>(
  selectors: readonly string[],
  root: ParentNode = document,
): T | null {
  for (const s of selectors) {
    const el = root.querySelector<T>(s);
    if (el) return el;
  }
  return null;
}
