# Issue detail

`/issues/<id>` shows one issue: an editable title and description, the opened date, a Properties box with the status menu, the assignee card, and the comments. Each section streams in on its own, behind its own skeleton. Arrows step to the previous and next issue.

## Sub-features

- `detail-sections` title (`#<id>` beside it), `Opened <date>`, description, `Properties` with `Status`, `Assignee` with name and title, `<n> comments`.
- `detail-nav` `All issues` goes back to the list; `Previous issue` / `Next issue` step by one id. `Previous issue` is a disabled button on `#1`; `Next issue` always links to the next id, past `#42` too (see [not found](not-found.md)).
- `detail-skeletons` while a section's data loads, its skeleton shows. Stepping to another issue shows the new issue's skeletons, not the old issue's content.
- `detail-assignee` the card shows the assignee's initials, name and title.

## How to get to it (user POV)

- Click a row in the [issue list](issue-list.md), or open `/issues/<id>` directly.
- From an issue, click `Previous issue` or `Next issue`.

## Driving it with control-examples

Preconditions:

- Baseline state. Issue `#3` is `Notification email loses input on refresh`, Open, assigned to Linus Torvalds (Kernel maintainer), 2 comments. Issue `#4` is `Notification email ignores the user's locale`.

Commands:

- **Sections.** `$CE open $U/issues/3; $CE snapshot`. Has `textbox "Title"`, `textbox "Description"`, `heading "PROPERTIES"`, `button "Status: Open. Change status"`, `heading "2 comments"`, `textbox "Add a comment"`, and links `All issues`, `Previous issue` (`/prefetch/issues/2`), `Next issue` (`/prefetch/issues/4`). `$CE text | grep -E '^(Opened|Assignee|Linus Torvalds|Kernel maintainer)'` prints `Opened Sun Jan 11 2026`, `Assignee`, `Linus Torvalds`, `Kernel maintainer`.
- **Next and previous.** `$CE click --role link --name 'Next issue' --exact; $CE wait --text "Notification email ignores the user's locale"; $CE eval location.pathname` gives `"/prefetch/issues/4"`. `$CE click --role link --name 'Previous issue' --exact` goes back to `/prefetch/issues/3`.
- **First issue.** `$CE open $U/issues/1; $CE snapshot | grep 'Previous issue'`. `button "Previous issue" [disabled]`.
- **Skeletons on a step.** `$CE open $U/issues/3; $CE select --name Latency --value 3000; $CE click --role link --name 'Next issue' --exact`, then right away `$CE eval 'location.pathname + " " + document.querySelectorAll(".animate-pulse").length + " " + document.querySelector("input[aria-label=Title]")?.value'`. `"/prefetch/issues/4 8 undefined"`: the URL moved and skeletons stand in for every section; issue `#3`'s title is gone. `$CE wait --role textbox --name Title --exact --timeout 15000` then shows the data. Click `Reset` afterwards.

## Gotchas

- The title is an input's value, not text. `$CE wait --text` reads input values too; `$CE text` doesn't.
- `PROPERTIES` is uppercase on screen (CSS); `$CE snapshot` reports what's rendered.
- The skeleton count can be lower than 8 once some sections have loaded; take it right after the click, at 3 s latency.
- `tanstack-start-effect`'s assignee card has an error state (`Could not load the assignee.` and a `Try again` button) for failures other than a missing issue. Seed data never fails, so it isn't reachable without breaking the RPC handler.
