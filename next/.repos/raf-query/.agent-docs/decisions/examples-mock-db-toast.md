# Production toast for mock-DB writes (human asked, agent designed)

- Human: in prod, toast whenever you change something — the mock DB does not work well on Vercel's runtime.
- **`warnMockDbWrite()`** in `@examples/ui/lib/mock-db-toast` shows a Sonner warning with a stable `id` so repeats refresh one toast. Call it from each mutation (title, body, status, comment) in both apps.
- **When**: any non-localhost hostname (the Vercel / custom-domain demos). Localhost stays silent — one long-lived Node process keeps the in-memory store. Set `sessionStorage.raf-query-mock-db-toast = "1"` to preview locally.
- **Why not always**: local in-memory store on `globalThis` is fine in one long-lived `pnpm dev` process; the toast would be noise. On Vercel, each serverless isolate can have its own seed, so writes vanish across requests.
- **UI**: shared shadcn `Toaster` (`sonner`) in each app's root shell. Vanilla sonner reads the theme via `next-themes`; apps wrap with `@examples/kit`’s `ThemeProvider`. The helper lives in `@examples/kit/lib/mock-db-toast`.
