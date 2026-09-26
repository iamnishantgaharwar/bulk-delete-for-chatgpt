import { CONFIG, queryFirst } from '../config';

export interface ChatRow {
  id: string;
  title: string;
  link: HTMLAnchorElement;
  eligible: boolean;
}

export function chatIdFromHref(href: string): string | null {
  try {
    const path = new URL(href, location.origin).pathname;
    return CONFIG.chatPathPattern.exec(path)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function currentChatId(): string | null {
  return chatIdFromHref(location.href);
}

export function titleOf(link: HTMLAnchorElement): string {
  const el = queryFirst<HTMLElement>(CONFIG.selectors.chatTitle, link) ?? link;
  return (el.textContent ?? '').trim() || 'Untitled chat';
}

/** The element that visually represents the row (used for hiding/highlighting). */
export function rowElement(link: HTMLAnchorElement): HTMLElement {
  return link.closest('li') ?? link;
}

function isExcluded(link: HTMLAnchorElement): boolean {
  const row = rowElement(link);
  return CONFIG.selectors.excludedRow.some((s) => row.matches(s) || !!row.closest(s));
}

/** All chat rows currently in the sidebar, in visual (DOM) order. */
export function getChatRows(): ChatRow[] {
  const rows: ChatRow[] = [];
  const seen = new Set<string>();
  for (const link of document.querySelectorAll<HTMLAnchorElement>(CONFIG.selectors.chatLink)) {
    const id = chatIdFromHref(link.getAttribute('href') ?? '');
    const eligible = !!id && !seen.has(id) && !isExcluded(link);
    if (id) seen.add(id);
    rows.push({ id: id ?? '', title: titleOf(link), link, eligible });
  }
  return rows;
}

export function findLinkById(id: string): HTMLAnchorElement | null {
  return getChatRows().find((r) => r.eligible && r.id === id)?.link ?? null;
}

/** Nearest scrollable ancestor of the chat list. */
export function findScrollContainer(): HTMLElement | null {
  const link = document.querySelector<HTMLElement>(CONFIG.selectors.chatLink);
  let el = link?.parentElement ?? null;
  while (el && el !== document.body) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}

export function sidebarNav(): HTMLElement | null {
  return document.querySelector<HTMLElement>(CONFIG.selectors.chatLink)?.closest('nav') ?? document.querySelector('nav');
}
