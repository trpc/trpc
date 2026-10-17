# Settings bar

The header has four selects and a Reset button for trying the app under different conditions, each select under a small label. The first, `Loader`, is the URL's verb (see [loader verb](loader-verb.md)). The other choices live in cookies (`link-prefetch`, `stale-time`, `db-latency`), so server rendering uses them too. On a desktop the selects sit in one row right of the app's name; on a phone they're a 2×2 grid under it, with Reset at the grid's right.

## Sub-features

- `settings-prefetch` `Prefetch links`: `Off`, `On intent`, `In viewport`, `On render`. With anything but Off, in-app links load the next page's data before the click.
- `settings-stale` `Stale time`: `0 ms`, `5 s`, `30 s`, `5 min`, `Forever`. How long the browser's cache counts data as fresh before refetching it.
- `settings-latency` `Latency`: `None`, `100 ms`, `400 ms`, `1 s`, `3 s`. Each API call waits about that long (±50%), on the server and from the browser.
- `settings-reset` the icon button `Reset settings` (its tooltip says the same) clears the three cookies and the query cache, then reloads with the defaults (Off, 5 s, 400 ms).

## How to get to it (user POV)

- The header of every page.

## Driving it with control-examples

Preconditions:

- Baseline state.

Name data requests with this expression (`$DATA`). It covers the REST API, Effect RPC, React Router's `.data` loaders and Next.js RSC fetches, and skips Vite's source modules:

```bash
DATA='performance.getEntriesByType("resource").map(e => new URL(e.name)).filter(u => (u.pathname.startsWith("/api/") && !u.pathname.includes("/src/")) || u.pathname.startsWith("/rpc") || u.pathname.endsWith(".data") || u.searchParams.has("_rsc")).map(u => u.pathname + u.search)'
```

Commands:

- **Options.** `$CE open $U/issues; $CE snapshot | grep combobox` shows `Loader [value=prefetch]`, `Prefetch links [value=off]`, `Stale time [value=5000]`, `Latency [value=400]`.
- **Latency on the server.** `curl -s -o /dev/null -w '%{time_total}\n' -b db-latency=0 $U/issues/3` is well under a second; with `-b db-latency=3000` it's over 1.5 s.
- **Latency cookie.** `$CE select --name Latency --value None; $CE eval document.cookie`. Contains `db-latency=0`.
- **Stale time.** `$CE select --name 'Stale time' --value Forever`, then `$CE open $U/issues; $CE click --role link --name '/^#40 /'; $CE wait --text Opened; $CE click --role link --name 'All issues'; $CE wait --text Showing; $CE eval "$DATA"`. No `/api/issues/counts`: the browser kept its counts. Repeat with `--value '0 ms'`: `/api/issues/counts` and `/api/issues?…cursor=0` appear after the back navigation.
- **Prefetch on render.** `$CE select --name 'Prefetch links' --value 'On render'; $CE open $U/issues/3`, wait a second, `$CE eval "$DATA"`. Requests for issues `2` and `4` (the arrows) and the list (`All issues`), without any click.
- **Prefetch on intent.** `$CE select --name 'Prefetch links' --value 'On intent'; $CE open $U/issues/3; $CE hover --role link --name 'Next issue' --exact`, wait a second, `$CE eval "$DATA"`. Requests for issue `4` only.
- **Reset.** `$CE click --role button --name Reset`, wait for the reload (the URL, and so the verb, stays), `$CE snapshot | grep combobox` shows the defaults again and `$CE eval document.cookie` is `""`.

## Gotchas

- `$CE screenshot --width 390` shows the phone layout. Nothing in the header scrolls sideways at 360 px.

- What a prefetch request looks like depends on the stack: `/api/issues/4`, `/api/issues/4/comments?cursor=0` and `/api/issues/4/assignee` in `tanstack-start`; three `/rpc/` calls in `tanstack-start-effect`; `/issues/4.data` in `react-router`.
- In `react-router` the click requests the page's `.data` again (a second `/issues/4.data` after the hover's): React Router doesn't reuse the prefetched response, so the loaders run twice. The TanStack apps' click reuses what the hover loaded.
- `nextjs` has no `On render` option: `next/link` prefetches in the viewport or not at all, and the app adds intent itself. It also prefetches only in a production build (`pnpm --filter @examples/nextjs build && pnpm --filter @examples/nextjs start`); in dev, `$DATA` stays empty for both prefetch recipes.
- In `nextjs` and `react-router` a navigation always runs the server's page code (an RSC or `.data` fetch), whatever the stale time. Stale time shows in the browser's own requests: `/api/issues/counts` after the back navigation only with `0 ms`. `tanstack-start-effect`'s `/rpc/` calls all share one path; compare how many there are (more with `0 ms`).
- The `Stale time` values are milliseconds, and `Forever` is `Infinity`. `$CE select --value` takes the value or the label.
- A server restart doesn't clear cookies; Reset does.
- Reset doesn't touch the database: edits stay until the dev server restarts. The TanStack apps also call `router.clearCache()`, but every app reloads the page right after, so the four behave the same.
