---
name: verify-examples
description: Launch and drive the raf-query example issue tracker (TanStack Start, Next.js, React Router, TanStack Start Effect) in headless Chrome and with curl, the way a user does, and prove a change works in every app. Use when a change touches an example app, examples/.shared/, or packages/ behavior the examples show, or when checking the four apps still match.
---

# Verify the example apps

The four example apps are the same issue tracker on four stacks, so one feature map ([`features/README.md`](features/README.md)) covers all of them. A change to one app is proven in that app; a change to `examples/.shared/` or `packages/` is proven in all four.

| App                     | Start                   | Port | Data layer                      |
| ----------------------- | ----------------------- | ---- | ------------------------------- |
| `tanstack-start`        | `pnpm dev:start`        | 3000 | REST API at `/api/*` (Hono)     |
| `nextjs`                | `pnpm dev:next`         | 3001 | REST API at `/api/*` (Hono)     |
| `tanstack-start-effect` | `pnpm dev:effect`       | 3005 | Effect RPC at `/rpc`, no `/api` |
| `react-router`          | `pnpm dev:react-router` | 3006 | REST API at `/api/*` (Hono)     |

The helper below is `CE`:

```bash
CE="node .agents/skills/verify-examples/scripts/control-examples.mjs"
```

## Launch

Node comes from `.nvmrc`: run `eval "$(fnm env)" && fnm use` in each new shell. Dependencies: `pnpm install` at the root.

Start each app you need in its own tmux session, from the repo root, and leave it running:

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s example-react-router -c "$PWD" -- bash -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t example-react-router:0.0 'eval "$(fnm env)" && fnm use && pnpm dev:react-router' C-m
```

The table's `Start` column has each app's root script. No env vars, no database: data is an in-memory mock seeded when the server process starts.

Ready means `curl -s localhost:<port>/issues` returns issue rows (`Change status` is in the HTML). TanStack Start answers `/issues` with a 307 to `/issues?sort=newest&status=all`; follow redirects. The first request after a start compiles routes and can take 10-20 s.

Then start the browser:

```bash
$CE chrome start   # headless Chrome, DevTools on :9333, profile in /tmp/verify-examples
```

To check a production build instead of dev (Next.js prefetches links only in production): `pnpm --filter <package> build && pnpm --filter <package> start`, same port.

## Doctor

```bash
$CE doctor                     # Chrome + all four apps
$CE doctor --app react-router  # Chrome + one app
```

Each line is `ok` or `FAIL` with the reason. Drive nothing until the apps you need are `ok`. If an app is `FAIL` and you didn't start it, start it as in Launch; don't drive a port someone else's process owns without checking its tmux session first (`tmux -f /exec-daemon/tmux.portal.conf ls`).

## Drive

`$CE` with no arguments prints the full command list. The ones recipes use:

- `$CE open <url>`: navigate, wait for load and network idle, print the URL, title, and any console errors or exceptions during load. An exception here is a finding. `--color-scheme dark|light` emulates the OS theme for that load and prints the page's theme class and `color-scheme`.
- `$CE snapshot`: visible headings and controls as `role "accessible name" [state]`. Start here to find handles.
- `$CE click --role <role> --name <name>`: real mouse events at the element's center. `--name` is a case-insensitive substring; `--exact` for an exact match, `--nth <i>` for the i-th, `'/regex/'` for a pattern (`'/^Open \d+$/'`). It fails if something else covers the element (the devtools panel).
- `$CE hover --role <role> --name <name>`: move the mouse onto an element (link prefetch on intent).
- `$CE fill --role textbox --name <name> --value <v>`: click, select all, type.
- `$CE select --name <label> --value <value or label>`: choose an option of a native `<select>`.
- `$CE press Enter|Escape|Tab|ArrowDown|...`
- `$CE scroll bottom|top|<px>`: mouse-wheel scrolling; `bottom` keeps going while an infinite list grows.
- `$CE wait --text <t>` / `--gone <t>` / `--role <r> --name <n>`, with `--timeout <ms>` (default 10 s). Text includes what's typed in inputs. Wait on something, never sleep blindly before asserting.
- `$CE text`, `$CE eval '<expression>'`, `$CE screenshot --path <file>` (`--width 390` for a phone's layout).

Server-rendered HTML is checked with `curl` (see [server-rendering](features/server-rendering.md)). Persistence is checked with `curl` against `/api/*` in the three REST apps, and by reloading the page in `tanstack-start-effect`.

The feature files give the exact recipe per feature. One Chrome page is shared by every command, so drive one app at a time.

## Evidence

Write artifacts under `/opt/cursor/artifacts/verify-examples/<app>/<feature>/` (or `/tmp/verify-examples/artifacts/` outside a cloud agent):

- The action and the end state: the `$CE` commands you ran with their output, plus `$CE snapshot` and `$CE screenshot` after the action.
- For a write: a second read that doesn't go through the page's cache, either `curl` of the API or a fresh `$CE open` of the page.
- For server rendering: the `curl` output, grepped for the data.

Proof standards: drive the user path (clicks, typing), not `fetch` calls or React internals from `eval`. `eval` is for reading state after the user path ran. A change to shared code is unproven until each of the four apps has run its recipe; say which ones did.

## Cleanup

```bash
$CE chrome stop
```

This stops only the Chrome the helper started and deletes its profile. Stop dev servers you started by killing their tmux session (`tmux -f /exec-daemon/tmux.portal.conf kill-session -t example-react-router`), never by process name. Leave servers you didn't start running. Restarting a server reseeds its data, which undoes every write. Evidence stays where you wrote it.

## Helpers

[`scripts/control-examples.mjs`](scripts/control-examples.mjs): a dependency-free DevTools protocol client (Node 22+). Chrome comes from `CHROME_PATH` or `google-chrome`; `VERIFY_EXAMPLES_CDP_PORT` (default 9333) and `VERIFY_EXAMPLES_DIR` (default `/tmp/verify-examples`) move it.

## Keeping the map honest

When a change adds, removes, or renames something a user sees in the examples (a route, a control's accessible name, a setting, a message), update the matching feature file in the same PR. When the four apps stop matching, either fix the app or record the difference in that feature's `Gotchas` with the reason.
