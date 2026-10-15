// Size proxy only: the Promise sketch rebuilt on Effect internals, plus the
// optional pieces a real client may pull in (retry/timeout, SSE subscriptions).
// Not an API proposal.
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';

export interface Op {
  readonly path: string;
  readonly type: 'query' | 'mutation' | 'subscription';
  readonly input: unknown;
}

export class TrpcClientError extends Data.TaggedError('TrpcClientError')<{
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type Next = (op: Op) => Effect.Effect<unknown, TrpcClientError>;
export type Link = (
  op: Op,
  next: Next,
) => Effect.Effect<unknown, TrpcClientError>;

export interface Codec {
  readonly stringify: (value: unknown) => string;
  readonly parse: (text: string) => unknown;
}

const jsonCodec: Codec = { stringify: JSON.stringify, parse: JSON.parse };

const networkError = (cause: unknown) =>
  new TrpcClientError({ code: 'NETWORK', message: 'fetch failed', cause });

export function httpTerminal(url: string, codec: Codec = jsonCodec): Next {
  return (op) =>
    Effect.tryPromise({
      try: (signal) => {
        const target = `${url}/${op.path}`;
        return op.type === 'mutation'
          ? fetch(target, {
              method: 'POST',
              body: codec.stringify(op.input),
              headers: { 'content-type': 'application/json' },
              signal,
            })
          : fetch(
              `${target}?input=${encodeURIComponent(codec.stringify(op.input))}`,
              { signal },
            );
      },
      catch: networkError,
    }).pipe(
      Effect.flatMap((res) =>
        Effect.tryPromise({ try: () => res.text(), catch: networkError }),
      ),
      Effect.flatMap((text) => {
        const body = codec.parse(text) as
          | { result: { data: unknown } }
          | { error: { code: string; message: string } };
        return 'error' in body
          ? Effect.fail(new TrpcClientError(body.error))
          : Effect.succeed(body.result.data);
      }),
    );
}

export function retryLink(times: number, timeoutMs: number): Link {
  return (op, next) =>
    next(op).pipe(
      Effect.timeout(timeoutMs),
      Effect.catchTag('TimeoutError', (cause) =>
        Effect.fail(networkError(cause)),
      ),
      Effect.retry({ times, while: (err) => err.code === 'NETWORK' }),
    );
}

export function sseTerminal(
  url: string,
  codec: Codec = jsonCodec,
): (op: Op) => Stream.Stream<unknown, TrpcClientError> {
  return (op) =>
    Stream.fromReadableStream({
      evaluate: () => {
        const ctrl = new TransformStream<Uint8Array, Uint8Array>();
        void fetch(
          `${url}/${op.path}?input=${encodeURIComponent(codec.stringify(op.input))}`,
          { headers: { accept: 'text/event-stream' } },
        ).then(
          (res) => res.body?.pipeTo(ctrl.writable),
          (err: unknown) => ctrl.writable.abort(err),
        );
        return ctrl.readable;
      },
      onError: networkError,
    }).pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.filter((line) => line.startsWith('data: ')),
      Stream.map((line) => codec.parse(line.slice(6))),
    );
}

function chain(links: readonly Link[], terminal: Next): Next {
  return links.reduceRight<Next>(
    (next, link) => (op) => link(op, next),
    terminal,
  );
}

/** Adapts a `Stream` terminal for the Promise surface. */
export const asIterable =
  (subscribe: (op: Op) => Stream.Stream<unknown, TrpcClientError>) =>
  (op: Op): AsyncIterable<unknown> =>
    Stream.toAsyncIterable(subscribe(op));

export interface ClientOptions<TSub> {
  readonly links?: readonly Link[];
  readonly terminal: Next;
  readonly subscribe?: (op: Op) => TSub;
}

function createProxy(
  call: (path: string, method: string | undefined, args: unknown[]) => unknown,
): unknown {
  const proxy = (path: readonly string[]): unknown =>
    new Proxy(() => {}, {
      get: (_t, key) =>
        typeof key === 'string' ? proxy([...path, key]) : undefined,
      apply: (_t, _this, args: unknown[]) =>
        call(path.slice(0, -1).join('.'), path.at(-1), args),
    });
  return proxy([]);
}

const opType = (method: string | undefined): Op['type'] =>
  method === 'mutate'
    ? 'mutation'
    : method === 'subscribe'
      ? 'subscription'
      : 'query';

/** Effect surface: procedures return `Effect`/`Stream`. */
export function createEffectClient(
  opts: ClientOptions<Stream.Stream<unknown, TrpcClientError>>,
): unknown {
  const run = chain(opts.links ?? [], opts.terminal);
  return createProxy((path, method, [input]) => {
    const op: Op = { path, type: opType(method), input };
    return op.type === 'subscription' && opts.subscribe
      ? opts.subscribe(op)
      : run(op);
  });
}

/** Promise surface on Effect internals: `runPromise` / `toAsyncIterable`. */
export function createPromiseClient(
  opts: ClientOptions<AsyncIterable<unknown>>,
): unknown {
  const run = chain(opts.links ?? [], opts.terminal);
  return createProxy((path, method, args) => {
    const op: Op = { path, type: opType(method), input: args[0] };
    if (op.type === 'subscription' && opts.subscribe) {
      return opts.subscribe(op);
    }
    const signal = (args[1] as { signal?: AbortSignal } | undefined)?.signal;
    return Effect.runPromise(run(op), { signal });
  });
}
