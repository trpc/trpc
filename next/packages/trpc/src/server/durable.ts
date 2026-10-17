import {
  Cause,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Option,
  Queue,
  Schedule,
  Stream,
} from 'effect';
import { HttpServerRequest } from 'effect/http';
import { Persistence } from 'effect/persistence';
import {
  fromWireError,
  isTrpcError,
  statusOf,
  toWireError,
  TrpcError,
  withStatusHint,
  type AnyTrpcError,
  type WireError,
} from '../internal/error.ts';
import { HEADER } from '../internal/protocol.ts';
import type { Unset } from '../internal/types.ts';
import { danson } from '../serializer/danson.ts';
import type { Serializer } from '../serializer/index.ts';
import type { Chunk, Frame } from '../serializer/stream.ts';
import type { SerializeReturn } from '../serializer/sync.ts';
import { frameSinks, type FrameSink } from './frame-sink.ts';
import {
  makeEffectMiddleware,
  ok,
  type EffectMiddleware,
  type MiddlewareRequirements,
  type ReqCtx,
  type ReqInput,
  type ReqMeta,
} from './middleware.ts';

/**
 * Options for {@link experimental_durable}.
 * @since 0.1.0
 * @stability experimental
 */
export interface DurableOptions<TCtx, TInput, TMeta> {
  /**
   * The stored result's key, or `undefined` to run the call as usual. By
   * default `${path}:${callId}`, where `callId` is the `trpc-call-id`
   * request header `experimental_durableLink` sends. Scope it by user when ids could
   * be shared: `({ ctx, path, callId }) => callId && \`${ctx.userId}:${path}:${callId}\``.
   */
  readonly key?: (opts: {
    readonly ctx: TCtx;
    readonly input: TInput;
    readonly meta: TMeta;
    readonly path: string;
    readonly callId: string | undefined;
  }) => string | undefined;
  /** How long a result is kept. @default '10 minutes' */
  readonly ttl?: Duration.Input;
  /**
   * How long a running call's claim lasts without a heartbeat, after which
   * another instance may run it again. @default '30 seconds'
   */
  readonly claimTtl?: Duration.Input;
  /** How often a call another instance is running is checked. @default '250 millis' */
  readonly pollInterval?: Duration.Input;
  /** How often a resumed stream checks for new frames. @default '25 millis' */
  readonly streamPollInterval?: Duration.Input;
  /** Turns results into the JSON the store keeps. @default the default serializer */
  readonly serializer?: Pick<Serializer, 'serialize' | 'deserialize'>;
}

type Entry =
  | { readonly state: 'running'; readonly input: string }
  | { readonly state: 'streamed'; readonly input: string }
  | {
      readonly state: 'done';
      readonly input: string;
      readonly value: SerializeReturn;
    }
  | {
      readonly state: 'failed';
      readonly input: string;
      readonly error: WireError;
      readonly status: number;
    };

type Result =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly error: AnyTrpcError };

/** A call's result, and whether its output streams (it isn't kept as data). */
interface Ran {
  readonly result: Result;
  readonly streamed: boolean;
}

const CALL_ID = /^[\w.:-]{1,128}$/;
const RESUME_FROM = /^\d{1,9}$/;

const isDeferred = (value: unknown) =>
  Stream.isStream(value) ||
  (typeof value === 'object' &&
    value !== null &&
    (Symbol.asyncIterator in value ||
      typeof (value as PromiseLike<unknown>).then === 'function'));

/** Calls running on this instance, by store and key. */
const running = new WeakMap<object, Map<string, Deferred.Deferred<Ran>>>();

/** A SHA-256 of the serialized input; `''` for inputs with files. */
const fingerprint = (
  serializer: Pick<Serializer, 'serialize'>,
  input: unknown,
) =>
  Effect.promise(async () => {
    let json: string;
    try {
      json = JSON.stringify(serializer.serialize(input));
    } catch {
      return '';
    }
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(json),
    );
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
  });

const conflict = () =>
  new TrpcError({
    code: 'CONFLICT',
    message: 'This call id was used with a different input',
  });

/**
 * Keeps a query's or mutation's result, so a client that lost the response
 * gets it by calling again with the same call id instead of running it
 * twice. The call runs detached from its request: a closed tab or a dropped
 * connection doesn't interrupt it.
 *
 * Results live in Effect's `BackingPersistence` (`effect/persistence`):
 * `Persistence.layerBackingMemory` for one instance, `layerBackingRedis`,
 * `layerBackingSql` or `layerBackingKvs` for many. Successes and typed
 * errors are kept; unexpected errors aren't, so a retry runs again. A call
 * id reused with another input fails with `CONFLICT`.
 *
 * Over unbatched HTTP (`experimental_durableLink` sends durable calls
 * unbatched), outputs that stream (async iterables, `Stream`s, promises at
 * any depth) are kept as the frames the handler sends, written by a fiber
 * detached from the request. A retry that got `n` frames sends
 * `trpc-resume-from: n` and gets the rest, from any instance. Over other
 * transports they aren't kept.
 *
 * @example
 * ```ts
 * import { Persistence } from 'effect/persistence';
 *
 * const checkout = t.procedure.use(experimental_durable()).mutation(…);
 *
 * createFetchHandler({ router, layer: Persistence.layerBackingMemory });
 * createTrpcClient({ router: routerType<AppRouter>(), links: [experimental_durableLink(), httpLink({ url })] });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_durable<TReq extends MiddlewareRequirements = {}>(
  options: DurableOptions<ReqCtx<TReq>, ReqInput<TReq>, ReqMeta<TReq>> = {},
): EffectMiddleware<
  ReqCtx<TReq>,
  ReqInput<TReq>,
  ReqMeta<TReq>,
  {},
  TrpcError,
  Persistence.BackingPersistence,
  never,
  never,
  Unset
> {
  const ttl = Duration.fromInputUnsafe(options.ttl ?? '10 minutes');
  const claimTtl = Duration.fromInputUnsafe(options.claimTtl ?? '30 seconds');
  const pollInterval = options.pollInterval ?? '250 millis';
  const streamPollInterval = options.streamPollInterval ?? '25 millis';
  const serializer = options.serializer ?? danson;
  const keyOf =
    options.key ??
    ((opts) =>
      opts.callId === undefined ? undefined : `${opts.path}:${opts.callId}`);

  return makeEffectMiddleware((opts: any) =>
    Effect.gen(function* () {
      const request = yield* Effect.serviceOption(
        HttpServerRequest.HttpServerRequest,
      );
      const header = (name: string) =>
        Option.isSome(request) ? request.value.headers[name] : undefined;
      const callId = header(HEADER.callId);
      if (callId !== undefined && !CALL_ID.test(callId)) {
        return new TrpcError({
          code: 'BAD_REQUEST',
          message: `${HEADER.callId} must be 1 to 128 letters, digits, "_", "-", "." or ":"`,
        });
      }
      const resumeFrom = header(HEADER.resumeFrom);
      if (resumeFrom !== undefined && !RESUME_FROM.test(resumeFrom)) {
        return new TrpcError({
          code: 'BAD_REQUEST',
          message: `${HEADER.resumeFrom} must be a frame count`,
        });
      }
      const key = keyOf({ ...opts, callId });
      if (key === undefined) return yield* opts.next();

      const backing = yield* Persistence.BackingPersistence;
      const store = yield* backing.make('@trpc12/trpc/durable');
      const log = yield* frameLog(backing, {
        ttl,
        claimTtl,
        streamPollInterval,
      });
      const sink: FrameSink | undefined = frameSinks.get(opts.response);
      const input = yield* fingerprint(serializer, opts.input);
      let local = running.get(backing);
      if (!local) running.set(backing, (local = new Map()));

      const replay = (entry: Entry) => {
        if (entry.input !== input) return conflict();
        if (entry.state === 'done') {
          return ok(serializer.deserialize(entry.value));
        }
        if (entry.state === 'failed') {
          return withStatusHint(fromWireError(entry.error), entry.status);
        }
        if (entry.state === 'streamed') {
          if (!sink) {
            return new TrpcError({
              code: 'BAD_REQUEST',
              message:
                'A streamed durable call resumes over unbatched HTTP only',
            });
          }
          sink.replay = log.read(key, Number(resumeFrom ?? 0));
          return ok(undefined);
        }
        return undefined;
      };

      while (true) {
        const inFlight = local.get(key);
        if (inFlight) {
          const first = yield* Deferred.await(inFlight);
          if (!first.streamed) return settled(first.result);
          // Its first request keeps the frames; read them from the log, or
          // fail as a replay does without a frame sink.
          yield* Effect.sleep(pollInterval);
          continue;
        }
        const entry = (yield* store.get(key).pipe(Effect.orDie)) as
          | Entry
          | undefined;
        if (entry) {
          const replayed = replay(entry);
          if (replayed !== undefined) return replayed;
          yield* Effect.sleep(pollInterval);
          continue;
        }
        break;
      }

      const deferred = yield* Deferred.make<Ran>();
      local.set(key, deferred);
      const claim: Entry = { state: 'running', input };
      yield* store.set(key, claim, claimTtl).pipe(Effect.orDie);

      const work = Effect.gen(function* () {
        const heartbeat = yield* store
          .set(key, claim, claimTtl)
          .pipe(
            Effect.ignore,
            Effect.repeat(Schedule.spaced(Duration.divideUnsafe(claimTtl, 2))),
            Effect.forkChild,
          );
        const result = yield* opts.next() as Effect.Effect<Result>;
        yield* Fiber.interrupt(heartbeat);
        const entry = stored(serializer, result, input);
        // A streamed output's claim stays until the handler starts its log.
        const streamed = entry === undefined && result.ok && sink !== undefined;
        if (!streamed) {
          yield* (
            entry === undefined ? store.remove(key) : store.set(key, entry, ttl)
          ).pipe(Effect.orDie);
        }
        return { result, streamed };
      }).pipe(
        Effect.onExit((exit) =>
          Effect.sync(() => local.delete(key)).pipe(
            Effect.andThen(Deferred.done(deferred, exit)),
          ),
        ),
      );
      const fiber = yield* Effect.forkDetach(work);
      const joined = yield* Fiber.join(fiber);
      if (sink && joined.streamed) {
        sink.keep = (head, chunks) =>
          log.keep(key, head, chunks, () =>
            store
              .set(key, { state: 'streamed', input }, ttl)
              .pipe(Effect.orDie),
          );
      }
      return joined.result;
    }),
  );
}

const settled = (result: Result) =>
  result.ok ? ok(result.data) : result.error;

interface Meta {
  readonly count: number;
  readonly done: boolean;
}

/**
 * Streamed outputs, kept as frames: `${key}:${i}` holds frame `i`, and
 * `${key}:meta` how many there are. While the output streams, `meta` lives
 * for `claimTtl` and is refreshed, so readers stop when its writer dies.
 */
const frameLog = (
  backing: Persistence.BackingPersistence['Service'],
  opts: {
    readonly ttl: Duration.Duration;
    readonly claimTtl: Duration.Duration;
    readonly streamPollInterval: Duration.Input;
  },
) =>
  Effect.map(backing.make('@trpc12/trpc/durable-frames'), (store) => {
    const { claimTtl } = opts;
    const meta = (key: string) =>
      store.get(`${key}:meta`).pipe(Effect.orDie) as Effect.Effect<
        Meta | undefined
      >;

    /**
     * Writes the frames to the log from a fiber detached from the request,
     * so the output keeps streaming into it after the client leaves.
     * Returns them as they're written, for the request that ran the call.
     */
    const keep = (
      key: string,
      head: Frame,
      chunks: Stream.Stream<Chunk, unknown>,
      started: () => Effect.Effect<void>,
    ): Stream.Stream<Frame> =>
      Stream.unwrap(
        Effect.gen(function* () {
          const queue = yield* Queue.unbounded<Frame, Cause.Done>();
          let count = 0;
          const setMeta = (done: boolean) =>
            store
              .set(`${key}:meta`, { count, done }, done ? opts.ttl : claimTtl)
              .pipe(Effect.orDie);
          yield* setMeta(false);
          yield* started();
          const write = Effect.gen(function* () {
            const heartbeat = yield* setMeta(false).pipe(
              Effect.repeat(
                Schedule.spaced(Duration.divideUnsafe(claimTtl, 2)),
              ),
              Effect.forkChild,
            );
            yield* Stream.concat(
              Stream.make(head),
              Stream.catchCause(chunks, () => Stream.empty),
            ).pipe(
              Stream.runForEach((frame) =>
                Effect.gen(function* () {
                  yield* Queue.offer(queue, frame);
                  const i = count++;
                  yield* store
                    .setMany([
                      [`${key}:${i}`, { frame }, opts.ttl],
                      [`${key}:meta`, { count, done: false }, claimTtl],
                    ])
                    .pipe(Effect.orDie);
                }),
              ),
            );
            yield* Fiber.interrupt(heartbeat);
            yield* setMeta(true);
          }).pipe(Effect.ensuring(Queue.end(queue)));
          yield* Effect.forkDetach(write);
          return Stream.fromQueue(queue);
        }),
      );

    /** The frames from `from` on, polling for new ones until the last. */
    const read = (key: string, from: number): Stream.Stream<Frame> =>
      Stream.unwrap(
        Effect.gen(function* () {
          const current = yield* meta(key);
          if (!current) return Stream.empty;
          const keys = Array.from(
            { length: Math.max(0, current.count - from) },
            (_, i) => `${key}:${from + i}`,
          );
          const entries = isNonEmpty(keys)
            ? yield* store.getMany(keys).pipe(Effect.orDie)
            : [];
          const frames: Frame[] = [];
          for (const entry of entries) {
            if (entry === undefined) return Stream.fromIterable(frames);
            frames.push((entry as { frame: Frame }).frame);
          }
          const next = from + frames.length;
          if (current.done && next >= current.count) {
            return Stream.fromIterable(frames);
          }
          return Stream.concat(
            Stream.fromIterable(frames),
            Stream.unwrap(
              Effect.as(Effect.sleep(opts.streamPollInterval), read(key, next)),
            ),
          );
        }),
      );

    return { keep, read };
  });

const isNonEmpty = <A>(items: A[]): items is [A, ...A[]] => items.length > 0;

/** What to keep for `result`: nothing for unexpected errors and streams. */
const stored = (
  serializer: Pick<Serializer, 'serialize'>,
  result: Result,
  input: string,
): Entry | undefined => {
  if (!result.ok) {
    const error = result.error;
    return isTrpcError(error) && error.defined
      ? {
          state: 'failed',
          input,
          error: toWireError(error),
          status: statusOf(error),
        }
      : undefined;
  }
  if (isDeferred(result.data)) return undefined;
  try {
    return { state: 'done', input, value: serializer.serialize(result.data) };
  } catch {
    return undefined;
  }
};
