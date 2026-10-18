# Closed error unions: what a call fails with, and `closedLink()`

2026-10-18. Question ([proposal 24](../proposals/24-error-ownership.md), Q24.1–Q24.3): what can a call fail with today, can the client's error union be closed the way [result-rpc](https://result-rpc.com/)'s is, and does exhaustive matching need it?

Code: `next/spikes/closed-errors/`; run with `pnpm test` from `next/`. `effect` 4.0.2.

```ts
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [closedLink(), httpLink({ url })],
});
const [doc, err] = await safeClosed(client.doc.byId.query({ id }));
// err: the procedure's defined errors | one `defined: false` error per built-in code
if (err)
  matchError(err, {
    NOT_FOUND: (e) => …, // every defined code is required
    BAD_REQUEST: (e) => …,
    unexpected: (e) => …, // required while anything `defined: false` is left
  });
```

## Census: what reaches the client over `httpLink`

`census.test.ts` drives one server (the "deployed" router) through `httpLink` with a client typed against a newer router:

| Scenario                                          | Code on the client      | `defined` |
| ------------------------------------------------- | ----------------------- | :-------: |
| resolver returns `error({ code: 'NOT_FOUND' })`   | `NOT_FOUND`             |    yes    |
| resolver throws `new Error(…)`                    | `INTERNAL_SERVER_ERROR` |    no     |
| resolver throws `TrpcError` with a custom code    | `OUT_OF_STOCK`          |    no     |
| resolver throws `TrpcError` with a built-in code  | `CONFLICT`              |    no     |
| client calls a procedure the server doesn't have  | `NOT_FOUND`             |    no     |
| `fetch` rejects                                   | `NETWORK_ERROR`         |    no     |
| the call's `signal` is aborted                    | `CLIENT_CLOSED_REQUEST` |    no     |
| a proxy answers 401 with HTML                     | `UNAUTHORIZED`          |    no     |
| a proxy answers 502 with HTML                     | `BAD_GATEWAY`           |    no     |
| a proxy answers 520 with HTML                     | `PARSE_ERROR`           |    no     |
| the server speaks another protocol version (`11`) | `UNSUPPORTED_PROTOCOL`  |    no     |

## What works

- **One source keeps the union open.** A thrown, undeclared `TrpcError` keeps its code (`normalizeCause` in `server/execute.ts`), so any string can reach the client. Everything else that is `defined: false` is a built-in code: client links make `NETWORK_ERROR`, `CLIENT_CLOSED_REQUEST`, `CLIENT_ERROR`, `STREAM_INTERRUPTED` and `PARSE_ERROR`, and `codeOfStatus` maps a foreign response's status to a built-in code.
- **`closedLink()` closes it with one rule.** A `defined: false` error whose code isn't built-in becomes `INTERNAL_SERVER_ERROR`, with the original as its `cause`. It's a `Stream.mapError` over the rest of the chain, and the census with it in front has only defined errors and built-in codes.
- **`Closed<E>` is a type-only change:** `Exclude<E, UnexpectedError> | BoundaryError`, where `BoundaryError` is one `TrpcError<C, unknown> & { defined: false }` per `BuiltinErrorCode`. Defined members keep their codes and `data`.
- **`matchError(err, handlers)`** requires one handler per defined code, plus `unexpected` while any `defined: false` member is left. Once the undefined part is owned above (a shell, [error-shells](./error-shells.md)), `unexpected` becomes a type error. The type tests check every case.

## Findings

- **Exhaustive matching doesn't need a closed union.** `matchError` works on today's open union too, because `unexpected` takes the whole `defined: false` part. What does need closing is **subtracting one boundary code**. Over the open union, `Exclude<E, { code: 'NETWORK_ERROR' }>` removes nothing, since `UnexpectedError['code']` is `string`. Subtracting every undefined error (`Exclude<E, { defined: false }>`) already works.
- **An honest closed set is all 24 built-in codes.** A proxy can produce any of them (`UNAUTHORIZED` from an auth proxy, `TOO_MANY_REQUESTS` from a CDN), and so can a thrown built-in code. Listing 24 cases by hand isn't usable, so `matchError` takes one `unexpected` handler, and shells pick out the few codes they own.
- **`PARSE_ERROR` means four things:**
  - a foreign response with an unmapped status (520);
  - a body the client can't decode;
  - `validationLink`'s output mismatch;
  - the server failing to parse a request.

  result-rpc splits these into `HttpFailure`, `DecodeFailure` and `ProtocolViolation`.

- **A stale client looks like a missing record.** Calling a procedure the server lacks gives `NOT_FOUND`, which only `defined` tells apart from a domain `NOT_FOUND`. `UNSUPPORTED_PROTOCOL` is about the wire protocol version, not the router's shape. Nothing says "this client was built against a newer router".
- **No offline or timeout code on the client.** `NETWORK_ERROR` covers DNS failures, refused connections and `navigator.onLine === false` alike, and `TIMEOUT` only arrives as a 408 from a server.
- **`matchError` infers its result from the handlers object**, not a separate `R`. With `R` it was inferred from the first handler, and a string-literal return from `unexpected` narrowed it.

## Lean

- **Server side:** mask thrown, undeclared custom codes as `INTERNAL_SERVER_ERROR`, as non-`TrpcError` throws already are. They're as likely to leak internals (`LEGACY_BILLING_TIMEOUT`), and the client then needs no `closedLink`.
- **Client side:** change `UnexpectedError` to the per-code `BoundaryError` union. Built-in links already make only built-in codes.
- Ship `matchError` (or a `match` on `safe()` results) either way.
- Splitting `PARSE_ERROR` and a stale-client code are separate questions (Q24.6). Neither blocks closing the union.
