# Navigation progress bar

A thin bar in the brand color runs along the top of the window while a navigation waits, and goes away when the new page renders. It shows after 150 ms, so a navigation that opens at once (`prefetch`, or cached data under `ensure`) doesn't flash it.

## Sub-features

- `progress-wait` while a link's navigation waits on a loader (`ensure` on a cache miss, `fetch`), `progressbar "Loading page"` is at the top of the window and grows towards the right edge.
- `progress-instant` a navigation that opens at once never shows it (opacity stays 0).
- `progress-verb` choosing a verb in the header's `Loader` select shows it until the page under the new verb renders.

## How to get to it (user POV)

- Set Latency to `3 s`, then click any issue under `/ensure/issues` or `/fetch/issues`.

## Driving it with control-examples

Preconditions:

- Baseline state, then `Latency` `3 s` and `Stale time` `0 ms`.

Sample the bar every 250 ms after a click (`$SAMPLE`): `-` while it's absent, else its opacity.

```bash
SAMPLE='(async () => { const a = [...document.querySelectorAll("main a")].find((l) => /\/issues\/\d+$/.test(l.getAttribute("href"))); a.click(); const out = []; const t0 = performance.now(); while (performance.now() - t0 < 6000) { const b = document.querySelector("[role=progressbar][aria-label=\"Loading page\"]"); out.push(b ? (+getComputedStyle(b).opacity).toFixed(1) : "-"); await new Promise((r) => setTimeout(r, 250)); } return location.pathname + " | " + out.join(" "); })()'
```

Commands:

- **Waiting navigation.** `$CE open $U/ensure/issues; $CE eval "$SAMPLE"` prints about 3 s of `1.0` (after one `-` or `0.9`), then `-` once the issue page renders.
- **Instant navigation.** `$CE open $U/prefetch/issues; $CE eval "$SAMPLE"` never prints a value above `0.0`.
- **Loader select.** `$CE open $U/ensure/issues/7`, then choose `fetch` in `Loader`: the bar is there until `/fetch/issues/7` renders.

## Gotchas

- Next.js has no app-wide navigation state: each in-app link shows the bar while its own navigation is pending (`useLinkStatus`), and the `Loader` select shows it while its `router.push` transition is pending. A navigation started elsewhere (browser back) shows no bar there.
- Next.js and React Router wait on the server for `ensure` too, so the bar shows on every `ensure` visit there; the TanStack apps skip it when the issue is cached.
