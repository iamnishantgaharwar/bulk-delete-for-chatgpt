import { CONFIG } from '../config';
import type { ChatRef } from './deleter';

// The pending deletion queue is saved to chrome.storage.local (this device only)
// so a run interrupted by a reload or closed tab can be resumed.

const KEY = 'pendingQueue';

interface SavedQueue {
  items: ChatRef[];
  updatedAt: number;
}

/** `owned: false` marks the queue as abandoned by this tab, so it can be resumed right away. */
export async function saveQueue(items: ChatRef[], owned = true) {
  const updatedAt = owned ? Date.now() : 0;
  if (items.length) await chrome.storage.local.set({ [KEY]: { items, updatedAt } satisfies SavedQueue });
  else await clearQueue();
}

export async function clearQueue() {
  await chrome.storage.local.remove(KEY);
}

/** Returns a saved queue only if no other tab is currently working on it. */
export async function loadStaleQueue(): Promise<ChatRef[] | null> {
  const saved = (await chrome.storage.local.get(KEY))[KEY] as SavedQueue | undefined;
  if (!saved?.items?.length) return null;
  if (Date.now() - saved.updatedAt < CONFIG.queueStaleMs) return null;
  return saved.items;
}
