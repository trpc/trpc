# Devtools

A `raf-query` button at the bottom right opens the raf-query devtools panel: a live list of the page's queries with their status, key and last update, counts per status, a filter and a sort, and buttons to invalidate or clear the cache. The panel stays open across reloads once opened.

## Sub-features

- `devtools-toggle` `Open raf-query devtools` opens the panel; `Close raf-query devtools` closes it.
- `devtools-list` one row per query: status, key (for example `["issues","detail",3]`), last updated; counters for `fetching`, `error`, `stale`, `fresh`, `inactive`.
- `devtools-controls` `Filter queries`, `Sort queries`, `Invalidate all`, `Clear cache`; clicking a row shows its details (`Select a query to inspect it` before).
- `devtools-persist` the open state is stored in `localStorage["raf-query-devtools:open"]`.

## How to get to it (user POV)

- Click the `raf-query` button at the bottom right of any page.

## Driving it with control-examples

Preconditions:

- Baseline state (panel closed).

Commands:

- **Open.** `$CE open $U/issues/3; $CE click --role button --name 'Open raf-query devtools'; $CE snapshot | grep -E 'devtools|Invalidate|Clear cache|queries'`. Shows `button "Invalidate all"`, `button "Clear cache"`, `button "Close raf-query devtools"`, `combobox "Sort queries"`, `textbox "Filter queries"`.
- **Queries.** `$CE text | sed -n '/raf-query devtools/,$p'` lists `fresh 3` and the keys `["issues","assignee",3]`, `["issues","comments",3]`, `["issues","detail",3]`.
- **Details.** `$CE click --role any --name '["issues","detail",3]' --exact; $CE text | sed -n '/Query details/,$p' | head -12`. `Query details`, the key, `Status fresh`, `Observers 2`, `Last updated`.
- **Persisted.** `$CE eval 'localStorage.getItem("raf-query-devtools:open")'` is `"true"`; after `$CE open $U/issues/3` the panel is still open (`Close raf-query devtools` is listed).
- **Close.** `$CE click --role button --name 'Close raf-query devtools'`; `Open raf-query devtools` is back.

## Gotchas

- The open panel covers the bottom of the page. Clicks on rows or comments there fail with `covered by …`; close the panel first.
- The open state is per origin (per app). A panel left open in one app doesn't open in the others.
- Query counts depend on what the page has loaded: after scrolling the list, or with comments paged in, there are more rows than on a fresh load.
