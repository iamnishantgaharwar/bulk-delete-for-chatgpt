# Chrome Web Store submission — copy/paste sheet

## Store listing tab

**Name:** Bulk Delete for ChatGPT

**Summary (≤132 chars):**
Select many ChatGPT chats in the sidebar and delete them in one step. Runs locally, collects nothing. Not affiliated with OpenAI.

**Category:** Productivity  **Language:** English

**Description:**

Clean up your ChatGPT history in seconds instead of clicking through chats one at a time.

ChatGPT lets you delete chats one by one, or delete everything at once. Bulk Delete for ChatGPT lets you pick exactly which chats to remove and deletes them together.

HOW IT WORKS
1. Click "Bulk delete chats" at the top of the ChatGPT sidebar.
2. Tick the chats you want to remove. Shift-click selects a range; "Select all visible" ticks everything.
3. Click Delete, check the list of titles, and confirm.

FEATURES
• A "Manage chats" window listing your whole history with full titles and dates, including search, "older than…" filters and sorting
• Checkboxes on every chat in the sidebar
• Shift-click to select a range of chats
• Filter chats by title and select all matches
• "Load older chats" to reach older history
• Runs in the background while you keep using ChatGPT
• A progress panel with Cancel, plus a summary with retry for any failures
• If you close the tab mid-run, you can resume or discard the rest next time
• A confirmation window lists every chat before anything is deleted, and large batches need a typed confirmation
• Follows ChatGPT's light and dark mode
• Customise the look with presets or your own accent colour, Delete-button colour and corner style

PRIVACY
• Runs entirely in your browser: no servers and no analytics
• Talks only to chatgpt.com, using your existing session
• Only asks for access to chatgpt.com
• Open source: https://github.com/iamnishantgaharwar/bulk-delete-for-chatgpt

Deleted chats can't be recovered, so check the confirmation list before you confirm.

Independent project, not affiliated with, endorsed by, or sponsored by OpenAI. ChatGPT is a trademark of OpenAI.

**Assets needed:**
- Screenshots 1280×800 (1–5). Use a test account with no real chat titles. Suggested shots: select mode with checkboxes, the confirm window, the background progress panel, the summary.
- Small promo tile 440×280 (optional)
- Icon 128×128: already in `public/icons/icon128.png`

## Privacy practices tab

**Single purpose:**
Lets users select multiple ChatGPT conversations in the sidebar and delete them in one action.

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
