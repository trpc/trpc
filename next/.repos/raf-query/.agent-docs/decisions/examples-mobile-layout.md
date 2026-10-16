# Example apps fit a phone screen (human asked)

- Nothing may set a minimum width wider than the viewport. Two things did: the issue list's `truncate` (nowrap) title and the title `<input>` on the issue page, both `flex-1` items. They get `w-0`, so their content no longer counts toward the row's minimum width; the parents' grid tracks were widening to fit it and the page scrolled sideways. Lost: `min-w-0` on the grid items (doesn't reach a nested `auto` track) and `grid-cols-1` on every nested grid.
- Below `md`, the status filter is a wrapping row of pills with sort below it, not a sidebar; the issue page puts Properties and Assignee between the body and the comments (grid placement classes keep the desktop two-column layout). Below `sm`, list rows hide the comment count and date so the title gets the room.
- The header settings are a 2×2 grid of selects under the app's name, with Reset beside it (see `examples-header-toolbar.md`); page padding is `px-4` on phones, `px-6` from `sm`.
- Check it with headless Chrome: `Emulation.setDeviceMetricsOverride` at 360 and 412 wide, then `document.documentElement.scrollWidth` must equal `clientWidth` on `/issues` and `/issues/:id`.
- Files: each app's `status-filter.tsx`, `issue-list.tsx`, `edit-title.tsx`, `settings.tsx`, root layout, issues index page, issue page. The three apps share the class names.
