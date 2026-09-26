# Privacy Policy — Bulk Delete for ChatGPT

_Last updated: September 26, 2026_

Bulk Delete for ChatGPT runs entirely in your browser.

- **No data collection.** The extension has no analytics, no tracking and no backend server. It does not collect, store or send your chats, titles, account details or usage data.
- **Network requests.** The only requests the extension makes go to `chatgpt.com`, using your existing signed-in session. It reads your session token to list your chats (titles and dates, shown only on your screen) and to delete the chats you select. The token stays in memory for the current page and is never saved, logged or sent anywhere else.
- **Stored data.** It saves your settings (the on/off switch and your appearance choices: colours and corner style) in Chrome's `storage`. While a deletion is running, it also saves the IDs and titles of the chats still waiting to be deleted in local extension storage, on this device only, so the run can be resumed if the tab closes. This list is cleared when the run finishes or you discard it.
- **Permissions.** Host access to `https://chatgpt.com/*` (to add the selection UI and delete the chats you choose) and `storage` (for the on/off setting). Nothing else.
- **No remote code.** All code ships inside the extension package. The source is public so anyone can audit it.

If usage metrics are ever added, they will be opt-in and anonymous, and this policy will be updated first.

Contact: iamnishantgaharwar@gmail.com
