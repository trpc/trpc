# 16 — Client

| Status     | Area   | Depends on     | oRPC parity rows                                             |
| ---------- | ------ | -------------- | ------------------------------------------------------------ |
| `proposed` | client | 07, 09, 14, 17 | End-to-end typesafe input/output, End-to-end typesafe errors |

## Summary

Decide the shape of the vanilla client: call signatures, options, typing source, errors and subscriptions.

**Recommendation:**

- Keep `createTRPCClient<AppRouter>({ links })` and the `.query` / `.mutate` / `.subscribe` verbs.
- Input stays positional, with an options bag as the second argument (`signal`, typed `context`, link-defined options).
- Subscriptions return async iterables.
- One isomorphic error type (07).

## Today (v11)

- `createTRPCClient<AppRouter>({ links })` is a proxy client.
- `client.post.byId.query(input, { signal, context })`, where `context` is `Record<string, unknown>` (untyped). Also `.mutate(input, opts)` and `.subscribe(input, { onData, … })`.
- `TRPCClientError<TRouterOrProcedure>` carries `.shape`, `.data` and `.meta`.
- `safe(promise)` returns `[data, error]` (recent).
- `createTRPCUntypedClient` is for dynamic calls.
- `createTRPCProxyClient` remains as a deprecated alias.

## Goals

- The familiar call style, with typed per-call options.
- The client accepts router types _or_ contract types (09). Contract types are preferred for portability (01).
- Error narrowing and `safe()` (07).
- AbortSignal everywhere, with no leaked promises.

## Decision areas

### (a) Call signature

- **CS-A — Positional input plus an options bag:**

  ```ts
  await client.post.byId.query(
    { id: '1' },
    { signal, context: { cache: 'no-store' } },
  );
  await client.post.create.mutate({ title: 'Hello' });
  ```

- **CS-B — A single options bag:**

  ```ts
  await client.post.byId.query({ input: { id: '1' }, signal });
  ```

  - ✅ Strictly follows "option bags over multiple arguments".
  - ❌ Noisy for the 95% case. `void` inputs become `query({})`.

TanStack Query helpers use an options bag regardless (`queryOptions({ input })`; see 19).

### (b) Per-call options

- `signal` is always available.
- `context` is **typed**: links declare the context they read, for example `httpLink` reads `{ headers?: HeadersInit }` and `splitLink` reads `{ transport?: 'ws' | 'http' }` (17).
- **Link-defined options:** links can add top-level call options (`{ ignoreCache: true }`), as [#5498](https://github.com/trpc/trpc/pull/5498) explored. Whether these go top-level or under `context` is decided in 17.

```ts
await client.post.byId.query(
  { id: '1' },
  { signal, context: { headers: { 'x-trace': traceId } } },
); // httpLink
await client.post.byId.query({ id: '1' }, { context: { transport: 'ws' } }); // splitLink
await client.post.byId.query({ id: '1' }, { context: { transport: 'sse' } }); // type error

// with cacheLink() installed (17 (d))
await client.post.byId.query({ id: '1' }, { ignoreCache: true }); // F-A
await client.post.byId.query({ id: '1' }, { context: { ignoreCache: true } }); // F-B
```

### (c) Subscriptions

`client.onPost.subscribe(input, { signal, lastEventId })` returns an `AsyncIterable`, plus a `consume()` helper (14).

```ts
for await (const post of client.onPost.subscribe({ channel }, { signal })) render(post);
consume(client.onPost.subscribe({ channel }), { onData, onError, onComplete });
```

### (d) Errors

- With an isomorphic `TRPCError` (07 Q7.7), `error.code` and `error.data` are typed per procedure, and `error.defined` separates expected from unexpected errors.
- Transport failures (network, abort, parse) are `defined: false` errors with codes such as `CLIENT_CLOSED_REQUEST` and `NETWORK_ERROR` (**open**: a new code, or an `isNetworkError` property).
- `safe(promise)` works as in v11.
- `createSafeClient(client)` is an oRPC-style wrapper that applies `safe()` to every call (**open**).

```ts
const [post, error] = await safe(client.post.byId.query({ id }, { signal })); // tuple shape per 07 Q7.3
if (error?.defined && error.code === 'NOT_FOUND') error.data.id; // typed per procedure

// transport failures are defined: false
if (error && !error.defined) {
  if (error.code === 'NETWORK_ERROR') showOffline(); // Q16.4 new codes
  if (error.isNetworkError) showOffline(); // Q16.4 flag
  if (error.code === 'CLIENT_CLOSED_REQUEST') return; // aborted
}

// createSafeClient: every call returns the safe() result
const safeClient = createSafeClient(client);
const [post, error] = await safeClient.post.byId.query({ id });
```

### (e) Typing source

```ts
createTRPCClient<AppRouter>({ links }); // router type (implementation-first)
createTRPCClient<typeof appContract>({ links }); // contract (contract-first)
createTRPCClient<inferContract<AppRouter>>({ links }); // portable router contract
```

How links' context and options flow into the client type is the hard part, decided in 17.

The `links` argument itself is Q16.6:

```ts
// array (v11)
createTRPCClient<AppRouter>({ links: [loggerLink(), httpLink({ url })] });

// single composed link (oRPC style)
createTRPCClient<AppRouter>({ link: httpLink({ url }) });
createTRPCClient<AppRouter>({
  link: splitLink({
    condition: (op) => op.type === 'subscription',
    true: wsLink({ url }),
    false: httpLink({ url }),
  }),
});
```

### (f) Untyped client and dynamic use

`createUntypedClient({ links }).request({ path, type, input })` remains as an advanced, stable API. Integrations use it.

```ts
import { createUntypedClient, httpLink } from 'trpcdev/client';

const untyped = createUntypedClient({ links: [httpLink({ url })] });
const post = await untyped.request({
  path: 'post.byId',
  type: 'query',
  input: { id: '1' },
}); // unknown
```

## Recommendation

- **CS-A.**
- Typed `context`.
- AsyncIterable subscriptions.
- `safe()` + `createSafeClient()`.
- One error type with `defined`.
- A public untyped client.

## Questions for Alex

- **Q16.1** Positional input + options (CS-A) or a single bag (CS-B)?
- **Q16.2** Typed per-call `context` declared by links?
- **Q16.3** Ship `createSafeClient()` in addition to `safe()`?
- **Q16.4** Transport failures: new codes (`NETWORK_ERROR`), or an `isNetworkError`-style flag on the error?
- **Q16.5** Keep a public untyped client?
- **Q16.6** Keep `links: [...]` as an array, or accept a single composed `link` (oRPC style)?

## Decision

- **Q16.1:** [ ] CS-A · [ ] CS-B
- **Q16.2:** [x] yes, directly on the call options (no `context`) · [ ] no → [client](../decisions/client.md)
- **Q16.3:** [x] yes, ship both · [ ] no → [client](../decisions/client.md)
- **Q16.4:** [x] new codes (agent call, revisit later) · [ ] flag → [errors](../decisions/errors.md)
- **Q16.5:** [ ] yes · [x] not in `trpcdev/client`; in `trpcdev/extend` → [entry-points](../decisions/entry-points.md)
- **Q16.6:** [x] array, with inferred link options · [ ] single link · [ ] both → [client](../decisions/client.md)
- **Notes:**
