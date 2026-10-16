# SSR streaming

This document explains how TanStack Router adds hydration scripts to server-rendered HTML.
It describes the transport in `router-core` and the React, Solid, and Vue adapters.

## Main terms

The renderer and Seroval produce output independently.

- The **application output** is the HTML from the framework renderer.
- A **hydration source** is one complete JavaScript source string from the router or Seroval.
- An **initial tag** is a hydration `<script>` that `<Scripts>` renders with the application HTML.
- A **late record** is a self-removing hydration `<script>` that the transform inserts later.
- When hydration is enabled, the **boundary** is the final script from the first server render of `<Scripts>`.
- A **safe point** is a position where the transform can insert a late record.
- The **canonical close** is the exact byte sequence `</body></html>`.

The transport keeps the order from each producer.
It does not define one arrival order across both producers.
Instead, it inserts ready hydration sources at safe points in the application output.

The canonical close is the only application output that the merge path moves intentionally.

## Main components

A framework adapter produces application output as UTF-8 bytes or as an eager HTML string.
Seroval produces complete hydration sources.

`attachRouterServerSsrUtils()` creates one request-local hydration state with `createHydrationScripts()`.
`ServerSsr` stores this state directly.

The hydration state owns these tasks:

- It stores the request nonce.
- It creates the initial tags and the boundary.
- It frames late records.
- It keeps sources in FIFO order.
- It applies backlog limits.
- It reports output state and failures.
- It removes retained data during cleanup.

The stream transform reads this state.
It does not create the `<script>` framing.
It treats each late record as opaque bytes.

The transform only recognizes fixed protocol bytes in application output.
It is not an HTML parser.

## Request flow

A normal hydration request has these steps:

1. The hydration state starts with the Seroval cross-reference header and the router bootstrap.
2. `serverSsr.dehydrate()` builds the router state and starts Seroval.
3. Seroval sends complete hydration sources to the hydration state.
4. The first server render of `<Scripts>` takes all hydration sources that are ready.
5. `<Scripts>` renders initial tags, route scripts, manifest scripts, and one boundary.
6. The transform inserts later hydration sources at safe points.
7. Natural completion, cancellation, or failure cleans Router-owned request state.

The serialized router state contains rendered route-match data.
It can also contain data from `router.options.dehydrate()`.
Promises and streams in that data can produce hydration sources later.
The request signal stops Router's wait for this hook, but is not passed into
the application callback.

## Initial hydration tags

The hydration state counts each retained source when the source arrives.
This count includes the cross-reference header and router bootstrap.
It also includes sources that arrive before `<Scripts>` renders.

The first `<Scripts>` render takes all queued sources.
The initial tags then own those sources.
The hydration state removes them from its backlog count.

The take is a one-time operation.
A later `<Scripts>` render cannot create a second boundary.

### Initial tag size

Small adjacent sources can share one initial tag.
Their source text and separators must fit in 16 Ki UTF-16 code units.

A source that exceeds this limit stays in its own tag.
The code does not join that source to another source.

Every initial hydration tag has the `data-tsr-stream-part` attribute.

### Initial tag cleanup

The final initial tag normally includes cleanup code.
The cleanup code walks through preceding element siblings with `data-tsr-stream-part`.
It removes those siblings and then removes its own tag.

The cleanup code uses sibling links.
It does not create a DOM collection or call `document.querySelectorAll()`.

If appending cleanup makes the final initial tag exceed 16 Ki, the code creates a separate cleanup tag.
It never appends cleanup code to an already oversized source.

If no initial source exists, `<Scripts>` emits no initial cleanup tag.
It can still emit the boundary.

A hydration syntax error or runtime error can prevent cleanup.
In that case, temporary initial tags can remain in the document.

### Order inside `<Scripts>`

`<Scripts>` emits server content in this order:

1. Initial hydration tags.
2. Route and manifest script elements.
3. The boundary.

The boundary is the last child emitted by `<Scripts>`.
It is not required to be the last child in `<body>`.

React can hoist eligible external route scripts under its renderer rules.
The transport does not control when asynchronous or external scripts run.

## Placement of `<Scripts>`

`<Scripts>` marks the first position where late records can appear.
Render it in `<body>`.

Application markup, framework-owned deferred patch records, and closing markup can follow the boundary.
Late router records can appear between these output parts at the safe points below.
The byte-pattern rules below still apply.

While the transform remains in the `Merge` phase, it treats the first exact `</body></html>` after the boundary as the real document close.
The structural document close normally supplies this sequence.
Raw application data after the boundary must not contain an earlier exact copy.

React treats each exact lowercase `</script>` as a safe point.
After the boundary, each such sequence must be a position where script insertion is valid.

These rules are application and adapter contracts.
The byte scanner cannot tell structural markup from matching text.

## The boundary

The boundary is a private transport marker emitted by `<Scripts>`.
The boundary script removes itself in the browser.

The transform scans for the boundary only after the initial take.
Before that take, it forwards consumed application bytes without a boundary scan.

When the transform finds the boundary, it enters the `Merge` phase and lifts the hydration barrier.
Queued late sources then become eligible for output.

If application EOF arrives before the boundary, hydration-enabled merge mode releases the initial sources as late records.
The transform then drains them after the delivered document, as it does for any EOF safe point.
The page cannot hydrate without the route scripts that `<Scripts>` renders, but the response completes.
Disabled hydration and initial pass-through do not require a boundary.

## Transform paths

One stream implementation serves every request.
It starts in pass-through when the hydration state can reserve the fast path before any application output.
Otherwise it starts in merge mode and can change to pass-through later.
Both entries use the same `PassThrough` phase.

### Initial pass-through

The hydration state reserves initial pass-through only when all these conditions are true:

- The state is live and has no failure.
- Serialization is complete.
- The initial take or `disableHydration()` committed the initial output.
- No queued or active hydration output remains.
- No consumer or earlier fast-path reservation conflicts with this reservation.

The stream then never claims the hydration output and never scans.
It forwards each `Uint8Array` from the renderer unchanged.
It does not scan, copy, or move those bytes.

A Node renderer can also send string records.
The path encodes one string record at a time in chunks of at most 64 KiB.
It does not join separate string records.

At application EOF, the path marks rendering as complete and closes normally.

### Disabled hydration

`serverSsr.disableHydration()` disables router hydration output for one request.
Call it instead of `dehydrate()`, before rendering starts.

The runtime also rejects calls after any of these events:

- `dehydrate()` starts.
- The first `<Scripts>` take commits initial output.
- The transform claims the hydration output.
- The hydration producer completes or starts an active record.

The call removes the queued bootstrap sources.
It commits the initial state, lifts the barrier, and marks the producer as complete.

The request emits no hydration tags or router boundary.
`<Scripts>` can still render normal route and manifest scripts.
The transform can use initial pass-through.

### Merge mode

The transform uses merge mode when it cannot reserve initial pass-through.
Merge mode claims the request hydration output for one consumer.
A second consumer causes an error.

Merge mode recognizes these universal byte patterns:

1. The fixed router boundary suffix.
2. The exact canonical close.

An adapter can add one safe-point profile:

- `script-close` matches exact lowercase `</script>`.
- `record-end` uses the end of a complete renderer record.

The core does not select a profile from a framework name.
The adapter selects it.

The boundary and script-close matchers keep partial matches across input chunks.
Their patterns have a unique first byte.

The canonical close repeats its first byte.
The transform uses an exact search and a carry of at most 13 bytes for that pattern.

### Merge phases

| Phase            | Meaning                                                        |
| ---------------- | -------------------------------------------------------------- |
| `BeforeBoundary` | Forward application output and wait for the one-time boundary. |
| `Merge`          | Find safe points and the canonical close.                      |
| `HeldClose`      | Keep the canonical close while later output drains.            |
| `PassThrough`    | Forward all later application output without scanning.         |

A stream starts in `PassThrough` when initial pass-through is reserved; otherwise only `Merge` can enter it.
`HeldClose` must preserve final document order, so it cannot enter that phase.

A ready late record starts only after the boundary and at a safe point.
An active late record drains completely before application output resumes.

### Dynamic pass-through

Merge mode can stop scanning after the boundary.
It does this only when all these conditions are true:

- The hydration output is `Done`.
- No hydration source or active record remains.
- The transform holds no partial canonical close.
- The hydration state can reserve the fast path for the current consumer.

After the switch, all later application output passes through unchanged.
The transform does not scan or move later document closes.

## Adapter safe points

| Adapter or path | Additional safe point             |
| --------------- | --------------------------------- |
| React           | Exact lowercase `</script>`       |
| Solid           | End of a complete renderer record |
| Vue             | None                              |
| Eager string    | None                              |

The boundary and canonical close are safe points for every adapter.
Ordinary EOF is also a safe point after the boundary.
A partial canonical close at EOF is forwarded as ordinary content, as described below.

### React

The transform treats React chunk boundaries as arbitrary.
It does not use them as safe points.

The script-close profile lets a late record follow a complete React patch script.
It can also emit router data while React waits for later Suspense work.

The adapter uses `renderToReadableStream` when that function exists.
Otherwise, it uses `renderToPipeableStream`.
Both paths use the same script-close profile.
Both paths set `progressiveChunkSize` to positive infinity so React does not split completed Suspense boundaries into separate patches based only on output size.
The adapter does not inspect the React version.

### Solid

The Solid adapter preserves each complete shell or patch string as one renderer record.
It uses the end of that record as a safe point.

An internal 64 KiB encoding chunk is not a record end.
The safe point occurs only after the complete source record drains.

### Vue

The Vue adapter does not treat renderer record ends as safe points.
It uses only the boundary, the canonical close, and eligible EOF.

The Vue application output must have one `<html>` element as its outer root.
An outer Vue Fragment or root array is not supported.
Its closing marker follows `</html>`, and the transform does not preserve that position.
Fragments inside `<html>` are supported.

## Canonical document close

Merge mode recognizes only this exact adjacent lowercase sequence:

```html
</body></html>
```

While the transform remains in the `Merge` phase, the first matching sequence after the boundary becomes the held canonical close.
The transform emits preceding application bytes and holds the 14-byte close.

A match inside one byte chunk advances past the close without copying it.
The transform can emit the preceding prefix as a view of that chunk.
A match across chunks uses the carry and one small combined buffer.
The transform caches the search result for the current byte chunk, including a missing match.
Returning from a renderer safe point reuses that result; advancing to another byte chunk clears it.

The transform continues to process renderer patches and late records after it holds the close.
All other application bytes keep their order.
Late records keep FIFO order.
The two streams can interleave only at safe points.

After successful completion, the transform emits a fresh 14-byte copy of the held close last.
On failure or cancellation, the transform does not emit the held close.
Bytes already delivered to the consumer remain delivered.

The match is case-sensitive and byte-exact.
Whitespace or a text node between `</body>` and `</html>` prevents a match.

If the transform completes successfully without a canonical match, it preserves all application bytes.
A later record can then appear after `</html>`.
This can happen at a React script close, a Solid record end, or EOF.

Supporting every equivalent HTML form requires an HTML parser.
This transport uses exact byte matching instead.

Initial and dynamic pass-through never move a document close.
They also preserve bytes that follow `</html>`.

### EOF rules

After the boundary, ordinary EOF can provide the final safe point.
If a late record is `Active`, it drains first.
These rules apply after no record is active:

- If output is `Ready`, the transform drains ready late records at EOF.
- If output is `Waiting`, the transform waits for a state change.
- If normal serialization reaches `Done`, the transform completes.
- If output is `Failed`, the transform fails immediately.

A partial canonical-close prefix at EOF is ordinary application content.
The transform forwards those bytes first and then applies the rules above.
A late record can follow them, exactly as after a document without a canonical close.

Server cleanup terminates the transform instead of using these `Done` rules.

## Hydration output states

`claimOutput()` creates one pull view for merge mode.
The view has five states:

| State     | Meaning                                                                            |
| --------- | ---------------------------------------------------------------------------------- |
| `Waiting` | No late record is eligible. The queue can still contain blocked sources.           |
| `Ready`   | Queued sources can start at the next safe point.                                   |
| `Active`  | One late record is in progress and must finish.                                    |
| `Done`    | Normal output drained, hydration is disabled, or cleanup made the output inactive. |
| `Failed`  | The response must fail immediately.                                                |

The hydration output permits one consumer claim.
While it is live, it permits one active subscriber at a time.
Another subscriber can register after the first subscriber unregisters.
After cleanup, subscription returns a function that does nothing.

The transform calls `pullChunk()` only from a response-stream pull.
Each call returns at most 64 KiB of bytes.

## Late record framing

`hydrationScripts.ts` owns the complete framing of every late record.
The framing includes the opening tag, escaped nonce, separators, self-removal source, and closing tag.

A late record has this logical form:

```text
<script nonce="...">source;source;document.currentScript.remove()</script>
```

The nonce attribute is absent when the request has no nonce.
The code escapes `&`, double quotes, single quotes, `<`, and `>` in a dynamic nonce.

The transform does not inspect this framing.

### Late record size

The hydration output selects a FIFO source prefix for each late record.
Its target is at most 64 Ki UTF-16 code units for the complete framed record.

The hydration output never splits one hydration source across script tags.
Therefore, one large source can create a record above the target.

If a complete record is at most 16 Ki code units, the hydration output joins and encodes it once.
The hydration output encodes larger records in bounded parts with `encodeInto()`.

Every returned byte chunk is at most 64 KiB.
Application output cannot appear inside an active record.

### Queue ownership

The queue uses one source array and a head index.
When it selects the complete unconsumed array, it can reuse that array internally.

For a partial selection, it copies the selected prefix.
It replaces consumed queue slots with empty slots instead of shifting the live suffix.

The queue removes its backing array when it becomes empty.
For a busy queue, it can compact after at least 1,024 consumed entries.
The consumed prefix must also be at least as large as the live suffix.

Compaction keeps FIFO order.

The hydration output releases a source from backlog accounting after its text finishes encoding.
The record stays `Active` until its separators and closing code drain.

The boundary does not move or copy queued source strings.
It only makes them eligible for a pull.

Normal serialization adds `$_TSR.e()` as the final hydration source.
The hydration output becomes `Done` after that source and all earlier sources drain.

A backlog error changes the state to `Failed`, drops queued and active sources,
and causes Router to dispose of the SSR serializer.
Cleanup clears the queue and changes a claimed output to `Done`.

## Backpressure and memory limits

One downstream pull emits at most one output chunk.
The transform starts at most one application read ahead.

The merge path can retain these main values:

- One current application record and its encoder cursor, or one in-flight or prefetched nonterminal application read.
- One encoded application-string chunk of at most 64 KiB. The current input string record can be larger.
- At most 13 bytes from a partial canonical close.
- One active late record with its selected sources.
- One queue of later hydration sources.
- One hydration output buffer of at most 64 KiB.

The hydration state permits at most 4,096 retained sources across initial, queued, and active output.
It also permits at most 16,777,216 UTF-16 code units of regular retained source text.

These limits include constructor seeds and later sources.
They apply before and after the initial take.

The limits apply to the pending backlog, not to total response output.
Initial-source accounting ends at the initial take.
Late-source accounting ends when each source finishes encoding.

One source can exceed the 16 Mi-code-unit limit.
This exception supports one large loader or query value.
A second oversized source cannot be retained while the first is queued or being encoded.

Cleanup clears source arrays, active encoder state, callbacks, timers, and stored errors.

New eligible output and failures can wake the transform through one subscription.
`pullChunk()` does not notify the subscriber about successful state transitions.
When a producer update or barrier transition changes the output state, the hydration state still notifies the transform.
This notification can occur while a response-stream pull is pending.
Server cleanup terminates through a separate cleanup listener.
Application reads wake the transform separately.
The transform uses one waiting resolver at a time.
It does not create `Promise.race()` handlers in its pump.

## Unicode and string input

Built-in streaming adapters send UTF-8 `Uint8Array` records.
The transform forwards application bytes without decoding them.
A UTF-8 character can span byte records.

A Node pipeable stream can also send string records.
The transform encodes each string record independently in chunks of at most 64 KiB.

It does not repair a surrogate pair that spans two separate string records.
A record-end safe point occurs after the complete string, not after an internal encoding chunk.

Each hydration source is one complete JavaScript string.
A semicolon separates adjacent sources in one tag.
HTML markup separates sources in different tags.

`TextEncoder` and `encodeInto()` do not split a valid surrogate pair inside one source.
The implementation does not cut sources at estimated UTF-16 offsets.

### Eager string output

The eager helper uses the same merge path when initial pass-through is unavailable.
It encodes `<!DOCTYPE html>` and the HTML string in bounded parts.

It decodes merged output incrementally with `TextDecoder`.
It does not first collect one complete byte buffer or call `Response.text()`.

When initial pass-through is available, the helper returns `<!DOCTYPE html>` plus the original HTML string.
It then cleans the server state in a `finally` block.

## Completion and cleanup

The streaming paths use one finalizer.
The eager fast path uses its own `try` and `finally` because it has no response stream.

| Result                   | Response output | Application reader | `onAbort` |
| ------------------------ | --------------- | ------------------ | --------- |
| Natural completion       | Close           | Release            | No        |
| Request abort            | Error           | Cancel             | Yes       |
| Consumer cancellation    | No extra signal | Cancel             | Yes       |
| Stream or output failure | Error           | Cancel             | Yes       |
| Serialization timeout    | Error           | Cancel             | Yes       |
| Lifetime timeout         | Error           | Cancel             | Yes       |
| External server cleanup  | Error           | Cancel             | Yes       |

The terminal guard makes cleanup run once.
A non-success result calls the adapter `onAbort` function at most once.

After natural completion, the transform releases the application reader.
After another result, it cancels the reader.
Reader cancellation can finish after router cleanup.

Finally, server cleanup disposes of the SSR serializer and clears Router-owned hydration state.
It also stops the reader pump that Router's SSR RawStream bridge creates.
It clears the request router's `router.ssr` and `router.serverSsr` slots.

Cleanup listeners receive one boolean, `settled`.
It is true when every value the router dehydrated has settled.
Rejected hydration output, including a backlog failure, stops serialization without marking deferred values as settled.
Router aborts the request's route-match controllers only when `settled` is false, because only then can loader work still be pending.

Canceling a RawStream that the SSR or JSON bridge reconstructs removes Router's Seroval-stream listener.
Seroval and its official plugins remain responsible for work that they create.

### Timeouts

In merge mode, application EOF starts the serialization timeout and calls `setRenderFinished()`.
This happens as soon as a prefetched read reports EOF, even if the consumer pauses.
The default serialization timeout is 60 seconds.

The timeout runs only while Seroval remains active.
It changes hydration output to `Failed` when it expires.

Every live streaming transform also has a lifetime timeout.
Its default is twice the serialization timeout.

Some Web runtimes return numeric timer IDs with no `unref()` method.
The code calls `unref()` only when the returned timer handle provides it.

The serialization timeout stays referenced because it protects active work after application rendering ends.

### External cleanup and response disposal

`ServerSsr.cleanup()` notifies each live transform.
The transform then fails with an `AbortError`, cancels its reader, and calls the adapter abort function.

A stream response also provides an idempotent `dispose()` function.
Disposal removes router ownership before it cancels the response body.
A renderer can ignore that body cancellation.

After response handoff, request-abort binding has four cases:

- If the request is already aborted, handoff disposes the stream immediately.
- If the live transform already observes the same request signal, handoff reuses its listener. On request abort, SSR cleanup also disposes the final response, including a body wrapped by middleware.
- Otherwise, with live router SSR state, handoff adds a listener to dispose the stream, and SSR cleanup removes that listener.
- Without live router SSR state, abort still disposes the stream. The one-time listener ends with the request signal.

### Adapter cancellation limits

Every streaming adapter rejects a request that is already aborted before renderer setup.
The adapters and core transform also detect an abort during synchronous setup before they return a response.

The React readable path passes the request signal to `renderToReadableStream`.
The React pipeable path passes `abort()` to the transform.

For Solid, cancelling the transform's reader errors the writable used by its renderer.
Vue pipes its public readable renderer stream into the transform, so reader cancellation propagates to Vue.
Neither renderer provides a disposal handle for unresolved component work.

The adapters stop outgoing bytes and release router-owned state.
An unresolved Solid or Vue resource can retain its renderer closure until that resource settles.

React and Solid bot-readiness waits observe an adapter signal that the transform aborts on failure or cancellation, including request abort, lifetime expiry, and external SSR cleanup.
These waits cannot keep the response promise pending after the transform terminates.
The extra controller is allocated only for bot waits on the readable-stream paths.
Each wait removes its listener when the wait ends.

## Test coverage

Unit tests cover every byte split of the boundary and script-close patterns.
They also cover every internal split of the canonical close.

Hydration-state tests cover initial ownership, exact framing, nonce escaping, FIFO order, size limits, completion, failure, and cleanup.

Transform tests cover safe points, content after `<Scripts>`, EOF, close carry, ordering, cancellation, timeouts, Unicode, and stream errors.

Adapter tests make sure that React, Solid, and Vue select the documented safe-point profiles.
Real-renderer tests cover React 19 script closes and Solid record ends.

React and Solid browser suites cover CSP for ordinary SSR output.
No browser CSP test forces a late dynamic hydration record.
Vue has no equivalent browser CSP suite.

Normal unit tests cover backpressure correctness and lost-record prevention.
Slow-consumer memory tests run only when `RUN_BACKPRESSURE_PERF=1`.

Browser tests cover hydration data, interaction, data order, and removal of initial hydration tags and the boundary.

The [SSR streaming benchmark](../../benchmarks/ssr-streaming/README.md) measures throughput and retained memory.
Use interleaved warm runs for latency comparisons.
Use isolated processes with forced garbage collection for memory comparisons.

Treat machine-specific measurements as supporting evidence.
They are not part of the transport contract.
