import { CONFIG } from '../config';

// Same-origin requests to ChatGPT's own backend, authenticated with the page's
// existing session. The access token is held in memory only; never stored or logged.

export class SessionExpiredError extends Error {}

let accessToken: string | null = null;

export async function getAccessToken(force = false): Promise<string> {
  if (accessToken && !force) return accessToken;
  const res = await fetch(CONFIG.endpoints.session, { credentials: 'include' });
  if (!res.ok) throw new Error(`Session lookup failed (HTTP ${res.status})`);
  const data = (await res.json().catch(() => ({}))) as { accessToken?: string };
  if (!data.accessToken) throw new SessionExpiredError('Not signed in');
  accessToken = data.accessToken;
  return accessToken;
}

export interface ChatSummary {
  id: string;
  title: string;
  /** Last activity, ms since epoch (null if unknown). */
  updatedAt: number | null;
  createdAt: number | null;
}

interface RawConversation {
  id?: string;
  title?: string | null;
  update_time?: string | number | null;
  create_time?: string | number | null;
  is_archived?: boolean;
  gizmo_id?: string | null;
}

/** ChatGPT returns times as ISO strings or epoch seconds depending on the endpoint version. */
function toMs(t: string | number | null | undefined): number | null {
  if (t == null) return null;
  if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : ms;
}

/** One page of the user's (non-archived, non-project) conversations, newest first. */
export async function listConversations(offset: number, limit: number): Promise<{ items: ChatSummary[]; total: number | null; raw: number }> {
  let token = await getAccessToken();
  let res = await fetch(CONFIG.endpoints.conversations(offset, limit), {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    token = await getAccessToken(true);
    res = await fetch(CONFIG.endpoints.conversations(offset, limit), {
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 || res.status === 403) throw new SessionExpiredError(`HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`Couldn't load chats (HTTP ${res.status})`);
  const data = (await res.json()) as { items?: RawConversation[]; total?: number };
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems
    .filter((c) => c.id && !c.is_archived && !CONFIG.isProjectConversation(c.gizmo_id))
    .map((c) => ({
      id: c.id!,
      title: (c.title ?? '').trim() || 'Untitled chat',
      updatedAt: toMs(c.update_time),
      createdAt: toMs(c.create_time),
    }));
  return { items, total: typeof data.total === 'number' ? data.total : null, raw: rawItems.length };
}
