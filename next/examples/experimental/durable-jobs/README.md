# Durable jobs example (experimental)

Two servers share one Redis, for durable calls and for locks:

- **A lost response.** A payment's response never arrives; `experimental_durableLink` calls again with the same `trpc-call-id`, and the server answers with the kept result instead of charging twice.
- **One invoice, two servers.** Two payments for one invoice reach different servers. `experimental_lock()` on `experimental_redisLocker()` runs them one at a time: the second waits (`ctx.lock.waited`) and finds the invoice paid.
- **A stream cut mid-way.** A report streams its rows. The first server's response is cut after three frames, and the retry goes to the other server with `trpc-resume-from: 3`, which reads the rest from Redis. The report runs once.

Kept results use Effect's `Persistence.layerBackingRedis`; both stores share one `NodeRedis.layer`. See [Durable calls](../../../docs/middleware/durable.md) and [Locks](../../../docs/middleware/lock.md). Everything here is `experimental_*` and may change in any release; the Cloudflare example covers the Durable Object flavour.

Needs Redis at `REDIS_URL` (default `redis://127.0.0.1:6379`), as in CI. Run it from `next/` with `pnpm example`, or here with `pnpm smoke`.
