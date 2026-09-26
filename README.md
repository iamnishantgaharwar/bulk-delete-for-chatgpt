# Bulk Delete for ChatGPT

Chrome extension (Manifest V3) that adds checkboxes to the ChatGPT sidebar so you can select many chats and delete them in one confirmed action. Works in Chrome, Edge and Brave.

> Independent project. Not affiliated with, endorsed by, or sponsored by OpenAI. ChatGPT is a trademark of OpenAI.

## Build & load

```sh
npm install
npm run build        # outputs dist/
npm run watch        # rebuild on change (inline sourcemaps)
npm run typecheck
npm run zip          # dist → bulk-delete-for-chatgpt.zip for the Web Store
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick `dist/`.

## Using it

1. On chatgpt.com, click **Select chats** at the top of the sidebar.
2. Click rows to tick them. Shift-click selects a range. **Select all visible** (or Ctrl/⌘+A) ticks everything shown.
3. **Filter** narrows rows by title, and **Select matches** ticks only the matching rows. **Load older chats** auto-scrolls the sidebar to load more history.
4. Click **Delete N**, check the list, and confirm. For more than 20 chats you have to type `DELETE`.
5. Deletion runs in the background. A small panel in the bottom-right corner shows progress and can be minimized, and you can keep chatting, switch chats, or queue more chats for deletion. Queued chats are crossed out in the sidebar. **Cancel** stops after the current request. When the run ends, the panel shows how many were deleted and how many failed, and lets you retry the failures.
6. If the tab is reloaded or closed mid-run, the unfinished queue is saved on this device, and the next time you open chatgpt.com you can **Resume** or **Discard** it.

Esc exits select mode. You can switch the extension on or off from its toolbar popup.

## How it works

| File | Role |
| --- | --- |
| `src/config.ts` | **All** ChatGPT selectors, endpoints, throttling and thresholds. Fix ChatGPT changes here. |
| `src/content/app.ts` | Select mode, row checkboxes, action bar, confirm/progress/summary modal (Shadow DOM) |
| `src/content/deleter.ts` | Sequential queue: API delete (primary), UI-click automation (fallback), backoff, cancel |
| `src/content/queue-store.ts` | Saves the pending queue to `chrome.storage.local` so an interrupted run can be resumed |
| `src/content/sidebar.ts` | Finds chat rows and reads their conversation IDs from `/c/<id>` links |
| `src/popup/*` | On/off toggle and how-to |
| `src/background.ts` | Sets defaults on install |

- **Deletion:** `PATCH /backend-api/conversation/<id>` with `{"is_visible": false}`, authenticated with the page's own session token. The token is fetched from `/api/auth/session` and kept only in memory. This is the request ChatGPT's own Delete button has been seen to send. **Check it against live network traffic before each release.** If the request fails with a non-retryable error, the extension tries clicking through the row's ⋯ → Delete → Confirm instead.
- **Safety:** chats are deleted only by the conversation IDs captured when you selected them. Requests go one at a time with a 500 ms gap. HTTP 429 and 5xx get exponential backoff (and `Retry-After` is honored). On 401/403 the run pauses and asks you to reload.
- **Scope (v1):** only top-level chats (`/c/<id>`) get checkboxes. Project chats (`/g/…/c/<id>`) are shown without them. Pinned chats are excluded through `selectors.excludedRow`; confirm those selectors on the live DOM.
- **Background runs:** deletion stays in the content script, not the service worker. The requests then come from the page with its own session, which avoids cross-origin and bot-protection problems, and Chrome's service-worker idle limit doesn't apply. The queue stays alive while you move between chats inside ChatGPT, and a heartbeat keeps a second tab from grabbing a queue that's still running.
- **Sidebar:** deleted rows are hidden with a CSS attribute, not removed, so React's DOM stays intact. A MutationObserver re-attaches checkboxes as the list lazy-loads.

## Privacy

No analytics, no servers. See [PRIVACY.md](PRIVACY.md).

## License

MIT — see [LICENSE](LICENSE).

## Not yet done

- FR-11 (select by date range, P2)
- Playwright smoke test against the live chatgpt.com (needs a test account)
- Web Store listing, screenshots
