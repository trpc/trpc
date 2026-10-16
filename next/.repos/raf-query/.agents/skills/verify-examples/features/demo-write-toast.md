# Demo write warning

On the deployed demos, the first write (status, title, description or comment) shows a warning toast: the mock database is in memory, and the next request can reach another server instance. Localhost doesn't show it unless asked to.

## Sub-features

- `toast-write` a write shows `Edits may not stick on this demo` with the explanation under it, at the bottom right, for 8 seconds.
- `toast-local` on `localhost` nothing shows, unless `sessionStorage["raf-query-mock-db-toast"]` is `"1"`.

## How to get to it (user POV)

- On a Vercel preview or the production demo, change an issue's status.

## Driving it with control-examples

Preconditions:

- Baseline state. Issue `#3` is Open.

Commands:

- **Shown when asked.** `$CE open $U/issues/3; $CE eval 'sessionStorage.setItem("raf-query-mock-db-toast", "1")'`, then `$CE click --role button --name 'Change status'; $CE click --role menuitem --name Closed --exact; $CE wait --text 'Edits may not stick on this demo' --timeout 5000`. `$CE text | grep -A1 'Edits may not stick'` also prints `This app uses an in-memory mock database. On Vercel, …`.
- **Put it back.** Set `#3` back to `Open`, then `$CE eval 'sessionStorage.removeItem("raf-query-mock-db-toast")'`.
- **Hidden on localhost.** Without the flag, the same status change shows no toast: `$CE wait --text 'Edits may not stick' --timeout 3000` times out.

## Gotchas

- Repeated writes reuse one toast; they don't stack.
- On a preview, a refresh can show the old value: another instance answered. That's the behavior the toast warns about, not a bug in the change under test.
