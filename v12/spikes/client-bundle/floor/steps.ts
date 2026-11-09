// The Effect APIs the minimal client uses, one export per step, in the
// order a hand-written link would need them. `floor.ts` bundles steps 0..n
// together, so each row's delta is what that step adds to the ones before.
import {
  Deferred,
  Effect,
  Exit,
  Queue,
  Request,
  RequestResolver,
  Scope,
  Stream,
  Tracer,
} from 'effect';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpTraceContext,
} from 'effect/http';

class CallError {
  readonly _tag = 'CallError';
  readonly cause: unknown;
  constructor(cause: unknown) {
    this.cause = cause;
  }
}

const get = (url: string) =>
  Effect.tryPromise({
    try: (signal) => fetch(url, { signal }).then((r) => r.json() as unknown),
    catch: (cause) => new CallError(cause),
  });

/** A query as one Effect run to a Promise: the floor of any Effect client. */
export const s0Promise = async (url: string): Promise<unknown> => {
  const exit = await Effect.runPromiseExit(get(url));
  if (Exit.isSuccess(exit)) return exit.value;
  throw exit.cause;
};

/** Links as Streams: a chain of suspended streams, read to its first value. */
export const s1LinkStreams = (url: string) =>
  Effect.runPromiseExit(
    Stream.runHead(
      Stream.catch(
        Stream.suspend(() => Stream.fromEffect(get(url))),
        (error) => Stream.fail(error),
      ),
    ),
  );

/** `subscribe()` as an `AsyncIterable`. */
export const s2AsyncIterable = (stream: Stream.Stream<unknown, unknown>) =>
  Stream.toAsyncIterable(stream);

/** SSE's producer: `Stream.callback` fed from a forked connection. */
export const s3Callback = (url: string) =>
  Stream.callback<unknown, CallError>((queue) =>
    get(url).pipe(
      Effect.matchCause({
        onSuccess: (value) => {
          Queue.offerUnsafe(queue, value);
          Queue.endUnsafe(queue);
        },
        onFailure: (cause) => Queue.failCauseUnsafe(queue, cause),
      }),
      Effect.forkScoped,
    ),
  );

/** SSE's reconnect loop: `Effect.repeat` with `Effect.sleep`, scoped. */
export const s4Repeat = (url: string) =>
  Effect.repeat(
    Effect.andThen(Effect.sleep(10), get(url)).pipe(Effect.scoped),
    { until: (value) => value === null },
  );

/** The data loader: `Effect.request` with a batching `RequestResolver`. */
interface Pending extends Request.Request<unknown, CallError> {
  readonly url: string;
}
export const s5Request = (url: string) => {
  const Pending = Request.of<Pending>();
  const resolver = RequestResolver.makeWith<Pending>({
    batchKey: () => 'all',
    delay: Effect.sleep(0),
    collectWhile: (entries) => entries.size < 10,
    runAll: (entries) =>
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        for (const entry of entries)
          entry.completeUnsafe(Exit.succeed(entry.request.url));
        yield* Scope.close(scope, Exit.void);
      }),
  });
  return Effect.request(Pending({ url }), resolver);
};

/** JSONL bodies: bytes to text lines to values. */
export const s6Lines = (body: ReadableStream<Uint8Array>) =>
  Stream.fromReadableStream({
    evaluate: () => body,
    onError: (cause) => new CallError(cause),
  }).pipe(
    Stream.decodeText,
    Stream.splitLines,
    Stream.map((line) => JSON.parse(line) as unknown),
    Stream.runCollect,
  );

/** Streamed outputs: a head `Deferred` and a queue per deferred value, read by a detached fiber. */
export const s7Deferred = (frames: Stream.Stream<unknown, CallError>) =>
  Effect.gen(function* () {
    const head = yield* Deferred.make<unknown, CallError>();
    const queue = Effect.runSync(Queue.unbounded<unknown>());
    yield* frames.pipe(
      Stream.runForEach((frame) =>
        Effect.sync(() => {
          Deferred.doneUnsafe(head, Effect.succeed(frame));
          Queue.offerUnsafe(queue, frame);
        }),
      ),
      Effect.forkDetach,
    );
    return [yield* Deferred.await(head), Stream.fromQueue(queue)] as const;
  });

/** Client spans with W3C trace headers, only when a tracer is installed. */
export const s8Tracing = (url: string) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const tracer = yield* Effect.tracer;
      if (tracer === Tracer.nativeTracer) return Stream.fromEffect(get(url));
      const span = yield* Effect.orDie(Effect.currentSpan);
      const headers = HttpTraceContext.toHeaders(span);
      return Stream.fromEffect(get(`${url}?${JSON.stringify(headers)}`));
    }),
  ).pipe(Stream.withSpan('trpc.call', { kind: 'client' }));

/** `effect/http`: requests through `HttpClient` with `FetchHttpClient`. */
export const s9HttpClient = (url: string) => {
  const client = HttpClient.withScope(
    Effect.runSync(
      Effect.provide(
        Effect.service(HttpClient.HttpClient),
        FetchHttpClient.layer,
      ),
    ),
  );
  return client.execute(HttpClientRequest.get(url)).pipe(
    Effect.flatMap((response) => response.text),
    Effect.scoped,
  );
};
