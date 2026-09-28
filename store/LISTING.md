# Chrome Web Store submission — copy/paste sheet

## Store listing tab

**Name:** Bulk Delete for ChatGPT

**Summary (≤132 chars):**
Bulk delete or archive ChatGPT chats. See your full history with dates, filter and select. Runs locally. Not affiliated with OpenAI.

**Category:** Productivity  **Language:** English

**Description:**

Clean up your ChatGPT history in seconds instead of clicking through chats one at a time.

ChatGPT only lets you delete chats one by one, or wipe everything at once. Bulk Delete for ChatGPT lets you pick exactly which chats to remove, then deletes or archives them together in the background while you keep chatting.

HOW IT WORKS
1. Click "Select chats" at the top of the ChatGPT sidebar, or "Manage chats" at the top right to see your whole history.
2. Tick the chats you want to remove. Shift-click selects a range, and "Select all" ticks everything shown.
3. Click Delete or Archive, check the list, and confirm.

WHAT'S NEW IN 1.1
• Manage chats window: your whole history, not just what's loaded in the sidebar, with full titles and dates
• Search chats, filter by age (for example "older than 30 days") and sort
• Archive instead of delete: chats leave the sidebar but can be restored, with a one-click Undo
• Archived view to unarchive chats or delete them for good
• Appearance settings: presets or your own accent colour, Delete-button colour and corner style
• A cleaner design that matches ChatGPT's light and dark mode

FEATURES
• Checkboxes on every chat in the sidebar
• Shift-click to select a range of chats
• Filter by title and select all matches
• Load older chats with one click
• Delete and archive jobs run in the background while you keep using ChatGPT
• Progress panel with Cancel, and a summary with Retry for anything that failed
• If you close the tab mid-run, you can resume or discard the rest next time
• A confirmation window lists every chat first, and deleting more than 20 chats requires typing DELETE

PRIVACY
• Runs entirely in your browser: no servers, no analytics, no tracking
• Talks only to chatgpt.com, using your existing signed-in session
• Only asks for access to chatgpt.com
• Open source: https://github.com/iamnishantgaharwar/bulk-delete-for-chatgpt

Deleted chats can't be recovered. If you're unsure, archive them instead.

Made by Nishant Gaharwar. Independent project, not affiliated with, endorsed by, or sponsored by OpenAI. ChatGPT is a trademark of OpenAI.

**Assets needed:**
- Screenshots 1280×800 (1–5). Use a test account with no real chat titles. Suggested shots: select mode with checkboxes, the confirm window, the background progress panel, the summary.
- Small promo tile 440×280 (optional)
- Icon 128×128: already in `public/icons/icon128.png`

## Privacy practices tab

**Single purpose:**
Lets users select multiple ChatGPT conversations and delete or archive them in one action.

**Permission justifications:**
- `storage`: Saves the user's settings (the on/off switch and appearance choices: colours and corner style) and, during a deletion, the list of chats still waiting to be deleted, so an interrupted run can be resumed. Kept locally on this device.
- Host permission `https://chatgpt.com/*`: Needed to add checkboxes and controls to the ChatGPT sidebar and to send the user's delete requests to chatgpt.com using their existing signed-in session. No other sites are accessed.

**Remote code:** No, I am not using remote code.

**Data usage — collected/handled:**
- [x] Authentication information: the page's session token is read in memory only, to authorise the user's own delete requests to chatgpt.com. It is never stored or sent anywhere else.
- [x] Website content: chat titles and IDs are shown in the confirmation window and saved locally while a deletion is pending.

**Certifications (tick all three):**
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**
https://github.com/iamnishantgaharwar/bulk-delete-for-chatgpt/blob/main/PRIVACY.md
