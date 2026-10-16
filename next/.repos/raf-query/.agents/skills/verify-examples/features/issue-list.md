# Issue list

`/issues` lists the issues ten at a time, newest first, under a status filter with a count per status and a sort switch. Scrolling near the end loads the next page. Each row links to its issue and has its own status menu (see [status changes](status-changes.md)).

## Sub-features

- `list-counts` the filter shows `All`, `Open`, `In progress` and `Closed`, each with its count.
- `list-filter` choosing a status shows only issues with that status and puts it in the URL.
- `list-sort` `Newest` / `Oldest` reorders the list and puts the order in the URL.
- `list-pending` while a new filter or sort loads, the previous list stays on screen, dimmed and `aria-busy`.
- `list-infinite` scrolling near the end loads the next ten; `Showing N of M issues` counts what's loaded.
- `list-row-link` a row opens its issue.
- `list-empty` a filter with no issues shows `No issues.`

## How to get to it (user POV)

- Open `/` or `/issues`, or click the `Issues` link in the header from any page.
- On an issue, click `All issues`.

## Driving it with control-examples

Preconditions:

- Baseline state (seed counts: All 42, Open 17, In progress 16, Closed 9).

Commands:

- **Counts.** `$CE open $U/issues; $CE snapshot | grep -E '^link "(All|Open|In progress|Closed) [0-9]+"'`. Four links: `All 42`, `Open 17`, `In progress 16`, `Closed 9`.
- **Filter.** `$CE click --role link --name '/^Open \d+$/'; $CE wait --text 'of 17 issues'; $CE snapshot | grep 'Change status' | sort | uniq -c`. One line, `button "Status: Open. Change status"`: every row is Open. `$CE eval 'location.search'` has `status=open`.
- **Sort.** Then `$CE click --role link --name Oldest --exact; $CE wait --eval 'location.search.includes("sort=oldest") && !document.querySelector("[aria-busy=true]")'; $CE snapshot | grep -m1 '^link "#'`. The first row is `#3 Notification email loses input on refresh … Open` (the oldest Open issue). The URL has `sort=oldest` and still `status=open`.
- **Back to the default.** `$CE click --role link --name '/^All \d+$/'`, then `$CE click --role link --name Newest --exact`. The first row is `#42 Billing export breaks on narrow screens`.
- **Pending.** Set Latency to 3 s (`$CE select --name Latency --value 3000`), click `Closed`, and right away `$CE eval '!!document.querySelector("[aria-busy=true]")'`: `true`, and the old rows are still listed. After `$CE wait --text 'of 9 issues' --timeout 15000` it's `false`. Click `Reset` afterwards.
- **Infinite scroll.** `$CE open $U/issues; $CE scroll bottom; $CE wait --text 'Showing 42 of 42 issues'; $CE snapshot | grep -c 'button "Load more"'`. Prints `0`: no more pages.
- **Row link.** `$CE click --role link --name '/^#3 /'; $CE wait --text Opened; $CE eval location.pathname`. `"/prefetch/issues/3"`.

## Gotchas

- The URL differs per app for the same list. TanStack Start and TanStack Start Effect always carry both params (`/prefetch/issues?sort=newest&status=all`, and `/issues` redirects there). Next.js links carry both, but `/prefetch/issues` itself has none. React Router leaves out defaults: `/prefetch/issues`, `/prefetch/issues?status=open`, `/prefetch/issues?status=open&sort=oldest`. Assert on `location.search` containing a param, not on the whole URL.
- At the helper's 1280×900 window the end of the list is already near the viewport, so a fresh load shows `Showing 30 of 42 issues` before any scrolling. Don't assert `Showing 10 of`; assert the count grows to 42.
- `list-empty` isn't reachable on seed data (every status has issues). To see it, move all nine Closed issues to another status, then put them back.
- Status labels in rows are `aria-label`s, not text, so `$CE wait --text` / `--gone` can't see them. Wait on `Showing … of <total> issues` (each filter has its own total) or with `--eval`.
- The devtools panel covers the bottom right of the page. If a click fails with `covered by …`, close the panel (`$CE click --role button --name 'Close raf-query devtools'`).
- Status counts are part of the list's data: a status change elsewhere updates them after its write settles (see [status changes](status-changes.md)).
