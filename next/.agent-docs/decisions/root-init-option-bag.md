# Root init is `initTrpc<{ … }>()`, with no `.create()` (human)

- Human, 2026-10-10 (Q3.1): "ok let's go with first one then", liking oRPC's look "as it doesn't have the slightly odd `.create()` at the end". `const t = initTrpc<{ ctx: Context; meta: Meta }>()`. Every slot is optional; new root slots are new keys, and a definition-time runtime option, if one is ever needed, goes in the call.
- Why: one option bag in a type parameter, so adding a slot adds no method or intermediate builder type. Transport options moved to the handler, so nothing is left to "create". `t` is a plain object, so no root setters linger on `t.procedure` (oRPC's `$context` stays on its builder and silently re-types context).
- Lost: v11's `initTRPC.context<C>().meta<M>().create()` doesn't carry over. The generic is explicit-only; nothing passed to `initTrpc()` is inferred into the bag.
- Rejected: `initTRPC.create<{ … }>()`; v11's chain; oRPC's `$context<C>()` with no `t`.
- Lives in: `packages/trpcdev/src/server/init.ts`.
