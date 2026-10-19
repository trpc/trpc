# Durable jobs example (experimental)

Two servers share one Redis, for durable calls and for locks:

- **A lost response.** A payment's response never arrives; `experimental_durableLink` calls again with the same `trpc-call-id`, and the server answers with the kept result instead of charging twice.
- **One invoice, two servers.** Two payments for one invoice reach different servers. `experimental_lock()` on `experimental_redisLocker()` runs them one at a time: the second waits (`ctx.lock.waited`) and finds the invoice paid.
- **A stream cut mid-way.** A report streams its rows. The first server's response is cut after three frames, and the retry goes to the other server with `trpc-resume-from: 3`, which reads the rest from Redis. The report runs once.

Kept results use Effect's `Persistence.layerBackingRedis`; both stores share one `NodeRedis.layer`. See [Durable calls](../../../docs/middleware/durable.md) and [Locks](../../../docs/middleware/lock.md). Everything here is `experimental_*` and might change or go away in any release; the Cloudflare example covers the Durable Object flavour.

`server.ts` has the router and `listen()`. `client.ts` runs the three scenarios: `main(url, other)` sends the second payment and the resumed report to `other`. `start.ts` starts two servers in one process, so they also share the in-memory `db` that stands in for the app's database.

Needs Redis at `REDIS_URL` (default `redis://127.0.0.1:6379`), as in CI. `pnpm start` runs it. To run the halves apart, start one or more `pnpm server` (each with its own `PORT`) and run `pnpm client <url> [other url]`. With separate processes, use one server: each process has its own `db`. The [examples README](../../README.md) has the layout.
