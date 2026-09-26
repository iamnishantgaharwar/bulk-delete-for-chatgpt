import { CONFIG, queryFirst } from '../config';
import { SessionExpiredError, getAccessToken } from './api';
import { findLinkById } from './sidebar';

export type Action = 'delete' | 'archive' | 'unarchive';

export interface ChatRef {
  id: string;
  title: string;
  /** What to do with the chat. Missing = delete (queues saved by older versions). */
  action?: Action;
}

export interface FailedChat extends ChatRef {
  error: string;
}

export interface RunResult {
  /** Chats the action succeeded for (each carries its action). */
  done: ChatRef[];
  failed: FailedChat[];
  /** Not attempted because the run was cancelled or paused. */
  remaining: ChatRef[];
  cancelled: boolean;
  sessionExpired: boolean;
}

export interface RunHooks {
  onStart?(chat: ChatRef): void;
  onDone?(chat: ChatRef): void;
  onFailed?(chat: FailedChat): void;
  isCancelled(): boolean;
}

export const actionOf = (c: ChatRef): Action => c.action ?? 'delete';

class RetryableError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Method A: the same web request ChatGPT's own UI sends -----------------

async function applyViaApi(id: string, action: Action): Promise<void> {
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    const token = await getAccessToken();
    let res: Response;
    try {
      res = await fetch(CONFIG.endpoints.conversation(id), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(CONFIG.actionPayload[action]),
      });
    } catch {
      if (attempt >= CONFIG.maxRetries) throw new RetryableError('Network error');
      await backoff(attempt);
      continue;
    }

    if (res.ok) return;

    if (res.status === 401 || res.status === 403) {
      if (!refreshed) {
        refreshed = true;
        await getAccessToken(true);
        continue;
      }
      throw new SessionExpiredError(`HTTP ${res.status}`);
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= CONFIG.maxRetries) throw new RetryableError(`HTTP ${res.status} after ${attempt + 1} tries`);
      const retryAfter = Number(res.headers.get('Retry-After'));
      await (retryAfter > 0 ? sleep(Math.min(retryAfter * 1000, CONFIG.backoffMaxMs)) : backoff(attempt));
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
}

function backoff(attempt: number) {
  const ms = Math.min(CONFIG.backoffBaseMs * 2 ** attempt, CONFIG.backoffMaxMs);
  return sleep(ms + Math.random() * 250);
}

// ---- Method B: click the row's ⋯ menu → Delete/Archive (→ Confirm) ----------

async function waitFor<T>(fn: () => T | null | undefined, timeoutMs = 3000): Promise<T> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error('Timed out waiting for ChatGPT UI');
}

function realClick(el: Element) {
  const opts = { bubbles: true, cancelable: true, composed: true, view: window };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse' }));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'mouse' }));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
}

async function applyViaUi(id: string, action: Action): Promise<void> {
  if (action === 'unarchive') throw new Error('Unarchive needs the API');
  const link = findLinkById(id);
  if (!link) throw new Error('Chat not visible in sidebar');
  link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  link.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
  const row = link.closest('li') ?? link.parentElement ?? link;
  const optionsBtn = await waitFor(() => queryFirst<HTMLElement>(CONFIG.selectors.rowOptionsButton, row));
  realClick(optionsBtn);
  const itemText = CONFIG.selectors.menuItemText[action];
  const item = await waitFor(() =>
    [...document.querySelectorAll<HTMLElement>(CONFIG.selectors.menuItem)].find((el) => itemText.test((el.textContent ?? '').trim())),
  );
  realClick(item);
  if (action === 'delete') {
    const confirm = await waitFor(() => queryFirst<HTMLElement>(CONFIG.selectors.confirmDeleteButton));
    realClick(confirm);
  }
  await waitFor(() => !findLinkById(id), 5000).catch(() => {
    throw new Error(`Chat still present after UI ${action}`);
  });
}

// ---- Queue runner -----------------------------------------------------------

/**
 * Applies each chat's action one at a time, strictly by conversation ID.
 * The queue is consumed from the front and may be appended to while running.
 * Cancellation takes effect after the in-flight request finishes.
 */
export async function processQueue(queue: ChatRef[], hooks: RunHooks): Promise<RunResult> {
  const result: RunResult = { done: [], failed: [], remaining: [], cancelled: false, sessionExpired: false };
  let useApi = true;

  try {
    await getAccessToken(true);
  } catch (e) {
    if (e instanceof SessionExpiredError) {
      result.sessionExpired = true;
      result.remaining = queue.splice(0);
      return result;
    }
    useApi = false; // session endpoint unavailable — fall back to UI automation
  }

  while (queue.length) {
    const chat = queue[0];
    const action = actionOf(chat);
    if (hooks.isCancelled()) {
      result.cancelled = true;
      result.remaining = queue.splice(0);
      break;
    }
    hooks.onStart?.(chat);

    try {
      if (useApi) {
        try {
          await applyViaApi(chat.id, action);
        } catch (e) {
          // Hard, non-retryable API errors (e.g. the endpoint changed) → try the UI path for this chat.
          if (e instanceof SessionExpiredError || e instanceof RetryableError) throw e;
          await applyViaUi(chat.id, action).catch(() => {
            throw e;
          });
        }
      } else {
        await applyViaUi(chat.id, action);
      }
      queue.shift();
      result.done.push(chat);
      hooks.onDone?.(chat);
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        result.sessionExpired = true;
        result.remaining = queue.splice(0);
        break;
      }
      queue.shift();
      const failed = { ...chat, error: e instanceof Error ? e.message : String(e) };
      result.failed.push(failed);
      hooks.onFailed?.(failed);
    }

    if (queue.length) await sleep(CONFIG.throttleMs);
  }
  return result;
}
