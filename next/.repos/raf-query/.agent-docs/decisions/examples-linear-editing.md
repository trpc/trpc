# Example apps edit like Linear (human asked, agent designed)

- Human: make the example projects more fun and more like Linear — edit title in place, change status from the list.
- **Inline title and body**: the detail page's title and description are the inputs themselves (hover/focus tint, Enter / blur saves, Escape cancels). No separate "Rename" form. Still Form Actions + `useOptimistic` + `await qc.invalidate`.
- **Status from the list (and properties panel)**: each row's status badge opens a dropdown; choosing a status PATCHes optimistically. The detail page's sidebar has a Properties panel with the same control. The whole list row is the issue link, dropdown included (human asked). A click or middle-click on the control cancels the link so the menu doesn't navigate. The menu content is portaled, so choosing a status isn't a click on the link.
- **API**: `PATCH /api/issues/:id` accepts optional `title`, `status`, and `body` (`UpdateIssueFields` in `@examples/db/types`). `updateIssue` already supported status; body was added to match.
- **Comment compose**: reset the form as soon as the action starts (optimistic entry shows immediately), disable the textarea and show a spinning "Posting…" button via `useFormStatus`, and render unconfirmed comments dashed / muted / pulsing until invalidate lands.
- Lost: the always-visible title input + Rename button; a read-only status badge on the list and detail; leaving the comment box filled until the POST finished.
