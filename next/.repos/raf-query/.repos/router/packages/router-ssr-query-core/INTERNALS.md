# Internals of SSR Query Integration

## Purpose

This package connects server-side rendering (SSR) in TanStack Router to a TanStack Query `QueryClient`.

The integration sends the initial Query state with Router dehydration data. It sends render-time queries through a `ReadableStream`.

The React, Solid, and Vue packages call the same core function. This document gives details of that shared implementation.

Query Core details refer to version `5.102.0`, which this workspace installs. A newer version of Query Core can change these details.

The package accepts `@tanstack/query-core >=5.102.0`.

## Supported Lifecycle

The supported lifecycle has this order:

1. The application creates a Router and a request-owned `QueryClient`.
2. The application calls `setupCoreRouterSsrQueryIntegration`.
3. Router attaches the server SSR utilities.
4. Router loads the routes.
5. The request handler calls `serverSsr.dehydrate()`.
6. Seroval starts to serialize Router data, Query data, promises, and streams.
7. The framework renders the application.
8. A framework adapter or Router stream transform reports render completion.
9. Router releases the resources for the request.

The supported use requires integration setup before Router attaches the server SSR utilities. The usual `getRouter()` flow obeys this requirement.

The one-time `onServerSsrAttach` event lets the integration register Query cleanup for the request.

Standard Router and Start handlers call `serverSsr.dehydrate()` one time. Router enforces this lifecycle and rejects a second completed call.

Direct dehydration calls occur sequentially in the supported lifecycle.

## Transport Shape

The integration adds one `query` property to the Router dehydration data:

```ts
type DehydratedRouterQueryState = {
  query: {
    initial?: Array<DehydratedQuery>
    stream: ReadableStream<Array<DehydratedQuery>>
  }
}
```

The `query` property groups the Query transport data. The `stream` property is always present in data that the client receives.

When available, `initial` contains an array of queries from initial dehydration.

The integration adds `initial` only when initial dehydration selects one or more queries.

The transport contains Query entries exclusively.

`RouterSsrQueryOptions.dehydrateOptions` keeps the `DehydrateOptions` type from Query Core.

The transport uses `shouldDehydrateQuery`, `serializeData`, and `shouldRedactErrors` from these options.

Each initial entry and each stream entry has the `DehydratedQuery` shape.

Thus, the initial payload and all stream chunks use the same query data shape.

Router serializes the stream and pending promises with Seroval. The browser receives a separate reconstructed `ReadableStream`.

Server request cleanup controls the lifetime of the server stream.

## Server Setup

The server branch keeps the dehydration function that Router already has. The integration calls this function first.

Then the integration reads the Query cache and calls `dehydrateQuery` for each selected query.

Query writes from the Router function can enter the initial Query state.

The integration adds an `onServerSsrAttach` listener. This listener registers Query cleanup before Router loads the routes.

A redirect or loader error before dehydration can stop the request. The cleanup listener clears the request-owned `QueryClient`.

`shouldDehydrateAllQueries` is the fallback Query filter.

This filter selects every Query status, including `pending`. An explicit filter or a Query filter in the current defaults replaces this fallback.

## Initial Dehydration

Initial dehydration uses the usual precedence of TanStack Query options:

- The explicit `dehydrateOptions.shouldDehydrateQuery` filter
- The Query filter in the default options at that time
- The `shouldDehydrateAllQueries` fallback.

The integration uses the first available filter.

The integration selects this filter after it awaits the Router dehydration function. Thus, changes to Query defaults in that function apply.

At the same time, the integration selects `serializeData` and `shouldRedactErrors`. Explicit options have priority over the current Query defaults.

The integration uses these selected options for the initial queries and the Query stream.

The initial Query state can contain completed queries and pending queries. A selected pending query can contain an active retryer promise.

For every selected pending query, `dehydrateQuery` adds the `promise` property.

An active retryer supplies the property value. An inactive retryer supplies `undefined`.

The integration calls `dehydrateQuery` for each selected query. This preserves query state, pending promises, `meta`, and `queryType`.

The initial loop records each selected query hash in `sentQueries`.

The integration associates each hash with its first transported query version for the request.

After the initial Query state exists, the integration creates the Query stream. Then it subscribes before framework rendering starts.

When one or more initial queries exist, the returned `query.initial` contains the initial Query state.

The selected payload contains Query state and can contain `meta` and `queryType`.

The application configures general Query options and cache configuration separately.

The stream remains present for render-time queries.

## Stream State

`QueryStreamState` owns these active server resources:

- The stream controller
- The set of sent query hashes
- The function that unsubscribes from the Query cache
- The optional pending-query map.

`streamState` contains one full `QueryStreamState` object or `undefined`. The `undefined` value represents an inactive Query stream.

This type keeps all active stream resources together. The controller and unsubscribe function always exist together.

`finalizeQueryStream` sets `streamState` to `undefined`. Then it unsubscribes from the Query cache.

If `finalizeQueryStream` receives an error, the function puts the stream in an error state. Otherwise, the function closes the stream.

A cancelled stream is already terminal. Finalization still removes the Query cache subscription and releases the stream state.

A queued microtask sees the inactive state after finalization and exits.

## Query Selection

The Query cache can emit multiple events for one query. The integration stores one `Query` reference for each hash.

The pending-query map removes duplicate events in one batch. The set of sent query hashes removes duplicate transport across all payloads.

Query can install its promise after the first cache event.

The next applicable event exposes `event.query.promise`. The integration then adds the query to the pending-query map.

The stream path dehydrates the stored `Query` references directly. Its work is proportional to the selected render-time queries.

A larger Query cache increases the work that direct dehydration of stored `Query` references avoids.

## Stream Filter

The stream path uses the `shouldDehydrateQuery` filter that initial dehydration selected.

The stream path uses the `serializeData` and `shouldRedactErrors` values that initial dehydration selected.

The selected filter, serialization function, and error-redaction function stay fixed for the stream lifetime.

Query Core uses `shouldRedactErrors` for a dehydrated pending promise that later rejects. Existing `state.error` values retain their original value.

## Batching

The first eligible event creates the pending-query map. The integration queues one microtask for that map.

More applicable events can occur before the microtask operates. These events enter the same map and the same stream chunk.

The microtask dehydrates the queries before a timer callback runs.

Thus, dehydration occurs before React continues the related Suspense boundaries.

The React E2E suite examines final server-origin values and Query payload placement before the Router serialization-end marker.

The core unit test examines array batching directly.

`flushPendingQueries` removes the pending-query map first. Then the function dehydrates the stored queries.

A query that settles after this flush can create a new pending-query map. This map produces a new stream chunk.

`flushPendingQueries` sends one array when one or more queries pass the stream filter.

## Render Completion

The integration registers `finishRendering` with `serverSsr.onRenderFinished`. A framework adapter or Router stream transform reports render completion.

`finishRendering` calls `flushPendingQueries` synchronously and supersedes the scheduled microtask.

Then `finishRendering` removes the Query cache subscription. Finally, it closes the Query stream.

If streamed dehydration fails, the integration removes the subscription. Then the integration puts the stream in an error state.

Request cleanup clears the `QueryClient` after render completion.

Seroval serialization can continue after rendering completes. A transformed streaming response waits for application output and Router serialization.

This streaming path can transport Query output that Seroval produces after render completion.

Built-in string renderers use the HTML buffered at render completion. Then they release the request resources.

Transport output depends on filters, first-hash selection, errors, aborts, and lifetime limits.

## Request Cleanup

Request cleanup sets `cleanedUp` to `true`. Then cleanup removes the Query cache subscription.

Then cleanup closes the Query stream.

Cleanup releases the pending-query map and its unflushed data.

Finally, cleanup calls `QueryClient.clear()`. This call removes the cache entries for the request.

Query removal clears GC timers. It cancels active retryers. It also aborts the query-function signal.

A query function that obeys the signal stops after the abort.

SSR must use a request-owned Router and `QueryClient`. Setup occurs one time for this request-owned pair.

A request-owned client isolates the request data and cleanup.

A reused integrated Router keeps `cleanedUp` set to `true`. Subsequent Query dehydration from that Router returns `undefined`.

Cleanup can occur before the Router dehydration function completes. An aborted request is one cause of this race.

The integration uses a `finally` block around the Router dehydration function.

The block clears entries that the Router dehydration function creates after cleanup.

If cleanup occurs first and Router dehydration succeeds, the integration returns `undefined`.

If Router dehydration fails, the error propagates. If cleanup starts first, cleanup takes priority over successful dehydration data.

## Client Hydration

The client branch first awaits the hydration function that Router already has. Then it restores the initial Query cache synchronously.

It passes the query-only object `{ queries: query.initial }` to Query Core.

Then the integration gets the stream reader. Then it schedules the first read.

Router hydration resolves after reader setup. Stream chunks and transported pending promises continue independently.

If the stream buffer contains the first chunk, chunk hydration can occur before Router resumes. Otherwise, Router can resume before the chunk arrives.

The reader processes one chunk at a time. It wraps each chunk as `{ queries: value }` for `hydrateQueryClient`.

The reader starts the next read after it hydrates the current chunk. The reader is the only reader for this stream.

The reader holds the stream lock for the lifetime of the read chain.

If a read or chunk hydration fails, the reader stops. The integration writes `Error reading query stream:` and the error to the console.

## Pending Promise Hydration

A pending query can contain a serialized promise. Query Core first examines that promise for an inline result.

Router reconstructs a native promise. Thus, Router normally reports the promise result asynchronously.

If the timestamp and cache-state tests pass, Query Core can use an unresolved promise as `initialPromise`.

The first fetch attempt uses that transported promise. A rejected promise can enter normal retry behavior.

A subsequent retry can call an available query function.

An active retryer supplies the transported promise.

For an `undefined` promise value, a later client fetch uses the available query function.

## Redirect Errors

The integration enables client redirect handling by default. The client branch installs these handlers.

The client branch installs redirect handlers on the QueryClient caches. It preserves all other cache configuration.

Redirect handlers operate after Query Core completes its retry process. They store the Router location at that time in `error.options._fromLocation`.

Then the integration resolves the redirect. Then it calls `router.navigate`.

The redirect path uses the integration handler in place of the previous cache error function.

`handleRedirects: false` preserves the original error functions for both caches.

## Error Paths

An error from the Router dehydration function propagates before Query stream creation.

An error during initial Query dehydration also propagates to Router. Router request cleanup then clears the request-owned `QueryClient`.

If streamed dehydration fails, the integration puts the stream in an error state. Finalization also removes the Query cache subscription.

An initial hydration error rejects Router hydration. This category includes an error from initial Router or Query hydration.

After the read chain starts, a stream read error only writes a console error. A chunk hydration error has the same behavior.

An accepted pending-promise rejection uses Query retry and cache error behavior after Router hydration resolves.

Query Core consults `shouldRedactErrors` when a dehydrated pending promise rejects.

Only `false` preserves the original rejection error. Other values cause `Error('redacted')`.

## Ownership Boundaries

This package owns these resources:

- The Query cache subscription for the render phase
- The set of sent query hashes
- The pending-query map
- The controller for the server Query stream
- The cleanup action for the request-owned `QueryClient`.

Router core owns these resources:

- Seroval serialization of streams and promises
- `ServerSsr` listener dispatch and cleanup idempotence
- Backpressure, cancellation, and lifetime limits for the transformed stream.

TanStack Start or `createRequestHandler` owns the standard request order and request-signal connection.

Framework adapters and the Router stream transform report render completion. The host runtime owns the HTTP connection.

The application owns `QueryClient` creation. SSR must use a new `QueryClient` for each request.

## Assumptions

These assumptions are necessary for the implementation:

- Setup occurs before server SSR attachment.
- Standard handlers call `serverSsr.dehydrate()` one time.
- Direct dehydration calls occur sequentially.
- Initial Query dehydration callbacks complete before cleanup starts.
- The first transported query version for each hash is sufficient for the request.

These assumptions keep the lifecycle small. The component that defines each lifecycle rule controls that rule.

## Core Test Coverage

The core unit tests cover these behaviors:

- Explicit serialization and filtering for initial and streamed dehydration
- Explicit deserialization for initial and streamed hydration
- Default transport of pending queries and their promises
- Query-only initial cache access
- Creation and removal of the Query cache subscription
- Cleanup during asynchronous dehydration
- Same-turn batching from stored `Query` references
- A default serializer changed after setup
- A streamed serialization error
- Cleanup during an active render-time query
- Cleanup after Query stream cancellation
- Cleanup before dehydration
- Query cancellation during cleanup
- Cleanup registration during server SSR attachment.

Additional validation can cover these behaviors:

- Duplicate-hash suppression after transport
- `shouldRedactErrors`
- Redirect handling
- Errors from a detached client stream
- Cleanup from an HTTP request abort
- Terminal serialization for built-in string rendering
- Cleanup that starts inside an initial dehydration callback
- Reuse of an integrated Router.

## E2E Coverage

The E2E suite for the React Query integration includes an awaited loader query and an unawaited loader query.

The suite also covers render-time `useSuspenseQuery`. In its plain `useQuery` case, the browser calls the query function.

The Solid and Vue suites include the two loader cases and loader-prefetched `useQuery`.

These suites examine final server-origin or client-origin values.

The React query-heavy suite includes nine render-time `useSuspenseQuery` calls. Three queries return immediately.

Six queries return after delays.

The suite examines server-origin values, browser hydration, and client navigation.

It also finds the `slow-async-3` payload before Router emits the `$_TSR.e()` serialization-end marker.

One emitted script with `.next(` contains all three immediate values. Script buffering can combine more than one Seroval operation.

The script assertion provides serialization-placement evidence. The core unit test provides direct array-batching evidence.

## Performance Tests

`tests/dehydrate.bench.ts` first compares the output of two dehydration methods. It removes `dehydratedAt` from the comparison because this value changes.

Then it compares full-cache filtering with direct query-reference dehydration. The cache sizes are 10, 100, 1,000, and 10,000 queries.

`tests/server-lifecycle.bench.ts` measures six synthetic operations:

- Stream creation and closure
- Query cache subscription and removal
- Setup and cleanup before dehydration
- Setup and dehydration for an empty request
- One hundred `setQueryData` writes in a baseline `QueryClient`
- One hundred `setQueryData` writes with the integration.

The lifecycle benchmark measures these synthetic operations directly.

These benchmarks provide informational measurements.

## Maintainer Commands

After a Query Core update, reexamine this document.

Do the core unit tests from the repository root:

```sh
CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-ssr-query-core:test:unit --outputStyle=stream --skipRemoteCache -- tests/index.test.ts
```

Do the optional GC test with the Nx local cache disabled:

```sh
RUN_SSR_GC_TESTS=1 CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-ssr-query-core:test:unit --outputStyle=stream --skipRemoteCache --skipNxCache -- tests/index.test.ts
```

Do the performance tests:

```sh
CI=1 NX_DAEMON=false pnpm nx run @tanstack/router-ssr-query-core:test:perf --outputStyle=stream --skipRemoteCache
```

Do the E2E tests for the React Query integration:

```sh
CI=1 NX_DAEMON=false pnpm nx run tanstack-react-start-e2e-query-integration:test:e2e --outputStyle=stream --skipRemoteCache
```

Do the E2E tests for the Solid Query integration:

```sh
CI=1 NX_DAEMON=false pnpm nx run tanstack-solid-start-e2e-query-integration:test:e2e --outputStyle=stream --skipRemoteCache
```

Do the E2E tests for the Vue Query integration:

```sh
CI=1 NX_DAEMON=false pnpm nx run tanstack-vue-start-e2e-query-integration:test:e2e --outputStyle=stream --skipRemoteCache
```

Do the E2E tests for the React query-heavy suite:

```sh
CI=1 NX_DAEMON=false pnpm nx run tanstack-react-start-e2e-streaming-ssr:test:e2e --outputStyle=stream --skipRemoteCache -- tests/query-heavy.spec.ts
```
