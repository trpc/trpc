# Start server response ownership

This document describes how Start tracks response bodies while server middleware runs.

## Two ownership layers

Response body ownership tells Start which body belongs to the current middleware result.

Router SSR ownership tells Router when it can release request data, serialization state, readers, timers, and renderer work.

An internal `SsrResponse` value carries Router SSR cleanup data beside a `Response`. Start stores that data while middleware sees the ordinary `Response`.

Each request must use a separate router instance. Sharing one router between requests is unsupported.

## Middleware transfers

Start keeps one ownership record for the current response body. A response without a body does not need an ownership record.

Ownership transfers automatically in these cases:

- Middleware returns the same `Response` object.
- Middleware returns another `Response` with the same body object.

Web Streams do not expose the source of a different body. TypeScript also cannot describe this runtime relationship.

Middleware must mark a response that has a different derived body:

```ts
return transferResponseBodyOwnership(
  response,
  new Response(response.body!.pipeThrough(transform), response),
)
```

The first argument must be the current response. The second argument must contain a body derived directly from that response.

The marker records one direct relationship. It does not connect the streams or manage their lifecycles.

The derived body must propagate reads, completion, errors, and cancellation to the source body. A normal `pipeThrough()` chain has this behavior.

Start stores markers in a `WeakMap`. An entry lives exactly as long as its derived response; a stale marker cannot cause a false transfer because ownership never returns to an older source.

Normal responses do not create marker entries. The map does not keep an unreferenced derived response alive.

## Replacement and disposal

An unrelated response replaces the current ownership record. Start disposes the old record before it stores the replacement.

For a Router SSR response, disposal releases Router SSR state and cancels the original SSR body.

If middleware returned a different derived body, disposal also cancels that final body. This cancellation propagates through a correct derived stream.

For a plain response, disposal cancels the current body.

Body cancellation is best effort. Start does not await it, and a cancellation failure does not block Router cleanup.

Cleanup paths can request disposal more than once. Router SSR cleanup and native stream cancellation have idempotent effects.

Every internal `SsrResponse` disposer must also have idempotent effects.

A result that settles after request cancellation is no longer usable. Start disposes that late result when it arrives.

## Locks, clones, and branches

A locked body only proves that code holds a reader or pipe. A lock does not prove ownership or stream ancestry.

Start cannot cancel a locked body through `body.cancel()`. The code that acquired the reader owns that reader and must cancel or release it.

`Response.clone()` creates two body branches. It can also change the body object exposed by the original `Response`.

Start reads the current response body during disposal. It keeps only the original SSR body for Router cleanup.

Middleware owns every clone or `tee()` branch that it does not return. Middleware must consume or cancel each unused branch.

## Final handoff

Redirect conversion and `HEAD` handling dispose any body that they replace or remove.

Before returning a Router SSR stream, Start checks request cancellation. Start disposes the stream immediately if the request is already aborted.

Start binds later request cancellation to the disposer. While Router SSR state is live, SSR cleanup removes that listener. Otherwise the one-time listener ends with the request signal.

The Router stream transform releases Router SSR state after natural completion, stream errors, or consumer cancellation.

After handoff, the HTTP runtime owns consumption or cancellation of the returned body.

If Start does not hand off Router SSR ownership, the request cleanup block releases any remaining Router SSR state.

An abort can race with final handoff. Cleanup is idempotent. Either path can safely request cleanup.
