import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Queue,
  Request,
  RequestResolver,
  Scope,
  Stream,
} from 'effect';
import {
  fromWireError,
  streamErrors,
  type AnyTrpcError,
} from '../../../internal/error.ts';
import {
  HEADER,
  type BatchCall,
  type BatchLine,
} from '../../../internal/protocol.ts';
import type { Frame } from '../../../serializer/index.ts';
import type { Operation } from '../../link.ts';
import { badResponse, isByteStreamInput } from '../events.ts';
import {
  ok,
  readStream,
  toHttpError,
  type HttpFeature,
  type Transport,
} from './transport.ts';

/**
 * Options for {@link batching}.
 * @since 0.1.0
 * @stability stable
 */
export interface BatchingOptions {
  /**
   * The most calls one request carries.
   * @default 10
   */
  maxItems?: number;
}

/**
 * What {@link batching} returns, for `httpLink`'s `batch` option.
 * @since 0.1.0
 * @stability stable
 */
export interface HttpBatching {
  readonly _: unique symbol;
}

/**
 * Batching for `httpLink`: queries (and, separately, mutations) made in the
 * same tick go in one request. The server must enable batching too, and a
 * call opts out with `{ batch: false }`. Its code is bundled only where this
 * is imported.
 *
 * @example
 * ```ts
 * import { batching, httpLink } from '@trpc12/trpc/client';
 *
 * httpLink({ url: 'http://localhost:3000/trpc', batch: batching() });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function batching(opts: BatchingOptions = {}): HttpBatching {
  const feature: HttpFeature<
    (op: Operation) => Effect.Effect<unknown, AnyTrpcError>
  > = {
    build: (transport) => {
      const batched = makeBatcher<Operation>({
        key: (op) => `${op.type} ${initKey(op)}`,
        maxItems: opts.maxItems ?? 10,
        send: (batch) => sendBatch(transport, batch),
      });
      /**
       * Blobs need a multipart request of their own, and a byte stream is the
       * body of its own; a bad input fails alone.
       */
      const unbatchable = (op: Operation) => {
        if (op.context.batch === false || isByteStreamInput(op.input)) {
          return true;
        }
        try {
          return (
            transport.encode(op).parts.length > 0 || initKey(op) === undefined
          );
        } catch {
          return true;
        }
      };
      return (op) => (unbatchable(op) ? transport.single(op) : batched(op));
    },
  };
  return feature as unknown as HttpBatching;
}

/**
 * Calls batch together only when their `init`s are equal. `undefined` for
 * an `init` that can't be compared (it holds something JSON can't write).
 */
function initKey(op: Operation): string | undefined {
  const init = op.context.init;
  if (!init) return '';
  try {
    const { headers, ...rest } = init;
    const sorted = (value: unknown): unknown =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([k, v]) => [k, sorted(v)]),
          )
        : value;
    return JSON.stringify([[...new Headers(headers).entries()], sorted(rest)]);
  } catch {
    return undefined;
  }
}

/** Sends a batch as one request and answers each call from its lines. */
function sendBatch(
  transport: Transport,
  batch: Batch<Operation>,
): Effect.Effect<void, AnyTrpcError> {
  const reviveError = (value: unknown) => fromWireError(value);
  return Effect.gen(function* () {
    const ops = batch.calls;
    const frames = yield* Effect.forEach(ops, () =>
      Queue.unbounded<Frame, AnyTrpcError | Cause.Done>(),
    );
    const onLine = (line: BatchLine, headers: Headers) => {
      const op = ops[line.i];
      const queue = frames[line.i];
      if (!op || !queue) return Effect.void;
      if ('chunk' in line) {
        Queue.offerUnsafe(queue, line.chunk as Frame);
        return Effect.void;
      }
      try {
        transport.report(op, line.status, headers);
      } catch (error) {
        batch.settle(line.i, Exit.fail(error as AnyTrpcError));
        Queue.endUnsafe(queue);
        return Effect.void;
      }
      if (line.status >= 400) {
        let error: AnyTrpcError;
        try {
          error = fromWireError(
            transport.serializer.deserialize(line.body as never),
          );
        } catch (cause) {
          error = badResponse('Invalid error message')(cause);
        }
        batch.settle(line.i, Exit.fail(error));
        Queue.endUnsafe(queue);
        return Effect.void;
      }
      Queue.offerUnsafe(queue, line.body as Frame);
      return batch.settleWith(
        line.i,
        transport.serializer
          .deserializeStream(Stream.fromQueue(queue), {
            reviveError,
            ...streamErrors,
          })
          .pipe(
            Effect.catchCause((cause) =>
              Effect.fail(toHttpError(Cause.squash(cause))),
            ),
          ),
      );
    };
    return yield* Effect.gen(function* () {
      const calls: BatchCall[] = ops.map((op) => {
        const encoded = transport.encode(op);
        return {
          path: op.path,
          ...(encoded.json === undefined ? {} : { input: encoded.json }),
        };
      });
      const reply = yield* transport
        .post(
          ops,
          transport.baseUrl,
          { accept: transport.streamType, [HEADER.batch]: '1' },
          calls,
        )
        .pipe(Scope.provide(batch.scope));
      if (!ok(reply) || reply.web.body === null) {
        const err = yield* Effect.flip(transport.readError(reply));
        for (const [i, op] of ops.entries()) {
          try {
            transport.report(op, reply.web.status, reply.web.headers);
          } catch (error) {
            batch.settle(i, Exit.fail(error as AnyTrpcError));
          }
        }
        return yield* Effect.fail(err);
      }
      yield* readStream(reply, transport.frames).pipe(
        Stream.runForEach((line) =>
          onLine(line as BatchLine, reply.web.headers),
        ),
      );
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.fail(toHttpError(Cause.squash(cause))),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          for (const queue of frames) Queue.endUnsafe(queue);
        }),
      ),
    );
  });
}

/** Calls gathered into one batch, for a transport to answer. */
export interface Batch<C> {
  readonly calls: ReadonlyArray<C>;
  /**
   * Closed when a caller stops waiting and every other call is gone too
   * (answered, or its caller stopped waiting): the batch is no longer needed.
   */
  readonly scope: Scope.Scope;
  /** Answers call `i` now. A call keeps its first answer. */
  readonly settle: (i: number, exit: Exit.Exit<unknown, AnyTrpcError>) => void;
  /** Answers call `i` with `result` once it finishes; the batch waits for it. */
  readonly settleWith: (
    i: number,
    result: Effect.Effect<unknown, AnyTrpcError>,
  ) => Effect.Effect<void>;
}

/**
 * A data loader: calls made in the same macrotask with the same `key` go to
 * `send` together, at most `maxItems` at a time. When `send` ends, the calls
 * it didn't answer fail with its error, or as unanswered if it succeeded.
 */
export function makeBatcher<C>(opts: {
  readonly key: (call: C) => string;
  readonly maxItems: number;
  readonly send: (batch: Batch<C>) => Effect.Effect<void, AnyTrpcError>;
}): (call: C) => Effect.Effect<unknown, AnyTrpcError> {
  /**
   * A call waiting for its batch. `gone` once it settled or its caller
   * stopped waiting; `onAbort` closes the batch's scope once every call in
   * it is gone.
   */
  interface Pending extends Request.Request<unknown, AnyTrpcError> {
    readonly call: C;
    readonly key: string;
    gone: boolean;
    onAbort?: Effect.Effect<void>;
  }
  const Pending = Request.of<Pending>();

  const runAll = (
    entries: ReadonlyArray<Request.Entry<Pending>>,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const onAbort = Effect.suspend(() =>
        entries.every((entry) => entry.request.gone)
          ? Scope.close(scope, Exit.void)
          : Effect.void,
      );
      for (const entry of entries) entry.request.onAbort = onAbort;
      const settle = (i: number, exit: Exit.Exit<unknown, AnyTrpcError>) => {
        const entry = entries[i];
        if (!entry) return;
        entry.request.gone = true;
        entry.completeUnsafe(exit);
      };
      /**
       * Answers still resolving. `Effect.request` fails the calls a batch
       * ends without settling, so the batch waits for them.
       */
      const heads: Array<Fiber.Fiber<void>> = [];
      const exit = yield* Effect.exit(
        opts.send({
          calls: entries.map((entry) => entry.request.call),
          scope,
          settle,
          settleWith: (i, result) =>
            Effect.exit(result).pipe(
              Effect.map((exit) => settle(i, exit)),
              Effect.forkDetach,
              Effect.map((fiber) => {
                heads.push(fiber);
              }),
            ),
        }),
      );
      yield* Fiber.awaitAll(heads);
      // Only calls the transport never answered are still open.
      const rest = Exit.isFailure(exit)
        ? exit
        : Exit.fail(badResponse('The batch response ended without a result')());
      for (const i of entries.keys()) settle(i, rest);
    });

  const resolver = RequestResolver.makeWith<Pending>({
    batchKey: (entry) => entry.request.key,
    // A macrotask, so calls started in the same tick share a batch.
    delay: Effect.sleep(0),
    collectWhile: (entries) => entries.size < opts.maxItems,
    runAll,
  });

  return (call) =>
    Effect.suspend(() => {
      const request = Pending({ call, key: opts.key(call), gone: false });
      return Effect.request(request, resolver).pipe(
        Effect.onInterrupt(() =>
          Effect.suspend(() => {
            request.gone = true;
            return request.onAbort ?? Effect.void;
          }),
        ),
      );
    });
}
