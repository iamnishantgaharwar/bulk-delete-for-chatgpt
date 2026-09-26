import { CONFIG, queryFirst } from '../config';
import { SessionExpiredError, getAccessToken } from './api';
import { findLinkById } from './sidebar';

export interface ChatRef {
  id: string;
  title: string;
}

export interface FailedChat extends ChatRef {
  error: string;
}

export interface RunResult {
  deleted: ChatRef[];
  failed: FailedChat[];
  /** Not attempted because the run was cancelled or paused. */
  remaining: ChatRef[];
  cancelled: boolean;
  sessionExpired: boolean;
}

export interface RunHooks {
  onStart?(chat: ChatRef): void;
  onDeleted?(chat: ChatRef): void;
  onFailed?(chat: FailedChat): void;
  isCancelled(): boolean;
}

class RetryableError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Method A: the same web request ChatGPT's own UI sends -----------------

async function deleteViaApi(id: string): Promise<void> {
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    const token = await getAccessToken();
    let res: Response;
    try {
      res = await fetch(CONFIG.endpoints.conversation(id), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(CONFIG.deletePayload),
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

// ---- Method B: click the row's ⋯ menu → Delete → Confirm -------------------

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

async function deleteViaUi(id: string): Promise<void> {
  const link = findLinkById(id);
  if (!link) throw new Error('Chat not visible in sidebar');
  link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  link.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
  const row = link.closest('li') ?? link.parentElement ?? link;
  const optionsBtn = await waitFor(() => queryFirst<HTMLElement>(CONFIG.selectors.rowOptionsButton, row));
  realClick(optionsBtn);
  const deleteItem = await waitFor(() =>
    [...document.querySelectorAll<HTMLElement>(CONFIG.selectors.menuItem)].find((el) =>
      CONFIG.selectors.deleteMenuItemText.test((el.textContent ?? '').trim()),
    ),
  );
  realClick(deleteItem);
  const confirm = await waitFor(() => queryFirst<HTMLElement>(CONFIG.selectors.confirmDeleteButton));
  realClick(confirm);
  await waitFor(() => !findLinkById(id), 5000).catch(() => {
    throw new Error('Chat still present after UI delete');
  });
}

// ---- Queue runner -----------------------------------------------------------

/**
 * Deletes chats one at a time, strictly by the conversation IDs in the queue.
 * The queue is consumed from the front and may be appended to while running.
 * Cancellation takes effect after the in-flight request finishes.
 */
export async function runDeletion(queue: ChatRef[], hooks: RunHooks): Promise<RunResult> {
  const result: RunResult = { deleted: [], failed: [], remaining: [], cancelled: false, sessionExpired: false };
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
    if (hooks.isCancelled()) {
      result.cancelled = true;
      result.remaining = queue.splice(0);
      break;
    }
    hooks.onStart?.(chat);

    try {
      if (useApi) {
        try {
          await deleteViaApi(chat.id);
        } catch (e) {
          // Hard, non-retryable API errors (e.g. the endpoint changed) → try the UI path for this chat.
          if (e instanceof SessionExpiredError || e instanceof RetryableError) throw e;
          await deleteViaUi(chat.id).catch(() => {
            throw e;
          });
        }
      } else {
        await deleteViaUi(chat.id);
      }
      queue.shift();
      result.deleted.push(chat);
      hooks.onDeleted?.(chat);
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
