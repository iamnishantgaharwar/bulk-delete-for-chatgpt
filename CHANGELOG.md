# Changelog

All notable changes to Bulk Delete for ChatGPT. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-09-26

### Added
- **Manage chats window.** A button at the top right opens a large window listing your whole chat history, not just the chats loaded in the sidebar. Titles are shown in full, with each chat's last-updated date. You can search, filter by age (older than 1 week, 30 days, 3 months or 1 year), sort, and select by clicking, Shift-clicking, or Select all.
- **Archive.** Archive sits next to Delete in both the sidebar and the Manage chats window. Archived chats leave the sidebar but can be restored, so the confirm window doesn't ask you to type anything.
- **Undo archive** in the summary after a run.
- **Archived view** in Manage chats, where you can unarchive or permanently delete archived chats.
- **Appearance settings.** A new settings page, opened from "Customize appearance" in the popup. Choose a preset (Classic, Ocean, Forest, Grape, Sunset, Minimal) or set your own accent colour, Delete-button colour and corner style (Sharp, Rounded or Pill). A live preview shows light and dark mode, and changes apply instantly to open ChatGPT tabs.
- Archive and delete jobs can be queued together in one background run, and the summary counts each action separately.

### Changed
- Redesigned the extension's UI and popup with Tailwind CSS: rounded buttons and cards, clearer confirm and progress panels, and better dark-mode support.
- The sidebar toggle is now a clearly styled button, so it no longer looks like a chat row.
- In select mode, the sidebar scrolls far enough that the last chats aren't hidden behind the action bar.
- The progress bar now animates smoothly and no longer flickers.
- The resume panel now reads "Unfinished run", since a run can include archives as well as deletes.
- Added author, homepage and minimum Chrome version (110) to the manifest.

## [1.0.0] - 2026-09-26

### Added
- Select mode in the ChatGPT sidebar, with a checkbox on every chat.
- Shift-click range selection, Select all visible (Ctrl/⌘ A), filter by title, and "Load older chats".
- A confirm window listing every selected title. More than 20 chats requires typing `DELETE`.
- Background deletion with a progress panel, Cancel, a summary of what succeeded and failed, and Retry for failures.
- If the tab closes mid-run, you can resume or discard the unfinished queue next time.
- Rate limiting with exponential backoff, and a pause with a reload prompt if your ChatGPT session expires.
- A toolbar popup with an on/off switch and a short how-to.
- Runs entirely in the browser: no analytics and no servers, and it only needs access to `chatgpt.com`.

[1.1.0]: https://github.com/iamnishantgaharwar/bulk-delete-for-chatgpt/releases/tag/v1.1.0
[1.0.0]: https://github.com/iamnishantgaharwar/bulk-delete-for-chatgpt/releases/tag/v1.0.0
