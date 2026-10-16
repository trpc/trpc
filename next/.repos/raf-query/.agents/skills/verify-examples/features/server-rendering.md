# Server rendering

Every page arrives with its data in the HTML: loaders (or server components) start the page's queries, the shell streams first, and each section's data streams in after it as its query settles. The browser hydrates that cache and doesn't fetch the same data again.

## Sub-features

- `ssr-list` the issue list, status counts and first page of rows are in the HTML of `/issues`.
- `ssr-detail` the title, description, status, assignee and first page of comments are in the HTML of `/issues/<id>`.
- `ssr-stream` sections the server hasn't loaded yet stream as skeletons first, then as content in the same response.
- `ssr-no-refetch` hydrating doesn't refetch what the server sent.

## How to get to it (user POV)

- Open any URL directly (address bar, reload, or a shared link). Client-side navigations load data in the browser instead.

## Driving it with control-examples

Preconditions:

- Baseline state. Latency 400 ms (the default), so the stream has something to wait for.
- Issue `#3` is untouched: title `Notification email loses input on refresh`, 2 comments.

React puts `<!-- -->` between text parts, so strip those before grepping.

- **List HTML.** `curl -sL $U/issues | sed 's/<!-- -->//g' > /tmp/list.html; grep -o 'Change status' /tmp/list.html | wc -l; grep -o 'Showing [0-9]* of [0-9]* issues' /tmp/list.html`. `10` (one status menu per row) and `Showing 10 of 42 issues`.
- **Detail HTML.** `curl -s $U/issues/3 | sed 's/<!-- -->//g' > /tmp/detail.html; grep -o 'Notification email loses input on refresh' /tmp/detail.html | wc -l; grep -o '>Assignee<' /tmp/detail.html | wc -l; grep -o '[0-9]* comments\?<' /tmp/detail.html | head -1`. At least `1`, then `1`, then `2 comments<`.
- **Streaming.** `grep -b -o -e animate-pulse -e 'Notification email loses input on refresh' /tmp/detail.html | awk -F: '!seen[$2]++'`. Two lines, `<offset>:animate-pulse` first: the skeletons are earlier in the response than the issue's data. The offsets differ per app (the head is about 14 KB); only the order matters.
- **No refetch on hydrate.** `$CE open $U/issues/3`, then `$CE eval 'performance.getEntriesByType("resource").map(e => new URL(e.name).pathname).filter(p => p.startsWith("/api/") && !p.includes("/src/") || p.startsWith("/rpc"))'`. `[]`: the browser made no data request for what the server sent. To see that the filter catches data requests, click `Next issue` and run it again: the next issue's calls show up.

## Gotchas

- `tanstack-start` and `tanstack-start-effect` redirect `/issues` to `/issues?sort=newest&status=all`; use `curl -L`.
- `tanstack-start-effect` calls `POST /rpc/` (with the slash), not `/api/*`; the no-refetch filter covers both. An exact `=== "/rpc"` match never fires and passes for the wrong reason.
- In dev, Vite serves source modules with paths like `/@fs/.../api/src/client.ts` and `/src/rpc.ts`. The filter excludes them; a looser match such as `/\/api\/|\/rpc/` reports them as data requests.
- `head -c` on the response is not a streaming check: the document head (styles and scripts) is larger than any small byte window. Compare offsets as above.
- A slow first compile after a server start can make the first `curl` take 10-20 s. That's not streaming.
