import {
  Deferred,
  Duration,
  Effect,
  Fiber,
  Option,
  Schedule,
  Stream,
} from 'effect';
import { HttpServerRequest } from 'effect/http';
import { Persistence } from 'effect/persistence';
import {
  fromWireError,
  isTrpcError,
  toWireError,
  TrpcError,
  type AnyTrpcError,
  type WireError,
} from '../internal/error.ts';
import { HEADER } from '../internal/protocol.ts';
import type { Unset } from '../internal/types.ts';
import { danson } from '../serializer/danson.ts';
import type { Serializer } from '../serializer/index.ts';
import type { SerializeReturn } from '../serializer/sync.ts';
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
 * @since 12.0.0-alpha.0
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
  /** Turns results into the JSON the store keeps. @default the default serializer */
  readonly serializer?: Pick<Serializer, 'serialize' | 'deserialize'>;
}

type Entry =
  | { readonly state: 'running'; readonly input: string }
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

const CALL_ID = /^[\w.:-]{1,128}$/;

const isDeferred = (value: unknown) =>
  Stream.isStream(value) ||
  (typeof value === 'object' &&
    value !== null &&
    (Symbol.asyncIterator in value ||
      typeof (value as PromiseLike<unknown>).then === 'function'));

/** Calls running on this instance, by store and key. */
const running = new WeakMap<object, Map<string, Deferred.Deferred<Result>>>();

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
 * id reused with another input fails with `CONFLICT`. Outputs that stream
 * (async iterables, `Stream`s) aren't kept.
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
 * @since 12.0.0-alpha.0
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
  const serializer = options.serializer ?? danson;
  const keyOf =
    options.key ??
    (({ path, callId }) =>
      callId === undefined ? undefined : `${path}:${callId}`);

  return makeEffectMiddleware((opts: any) =>
    Effect.gen(function* () {
      const request = yield* Effect.serviceOption(
        HttpServerRequest.HttpServerRequest,
      );
      const callId = Option.isSome(request)
        ? request.value.headers[HEADER.callId]
        : undefined;
      if (callId !== undefined && !CALL_ID.test(callId)) {
        return new TrpcError({
          code: 'BAD_REQUEST',
          message: `${HEADER.callId} must be 1 to 128 letters, digits, "_", "-", "." or ":"`,
        });
      }
      const key = keyOf({ ...opts, callId });
      if (key === undefined) return yield* opts.next();

      const backing = yield* Persistence.BackingPersistence;
      const store = yield* backing.make('trpcdev/durable');
      const input = yield* fingerprint(serializer, opts.input);
      let local = running.get(backing);
      if (!local) running.set(backing, (local = new Map()));

      const replay = (entry: Entry) => {
        if (entry.input !== input) return conflict();
        if (entry.state === 'done') {
          return ok(serializer.deserialize(entry.value));
        }
        if (entry.state === 'failed') {
          return fromWireError(entry.error, entry.status);
        }
        return undefined;
      };
      const settled = (result: Result) =>
        result.ok ? ok(result.data) : result.error;

      while (true) {
        const inFlight = local.get(key);
        if (inFlight) return settled(yield* Deferred.await(inFlight));
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

      const deferred = yield* Deferred.make<Result>();
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
        yield* (
          entry === undefined ? store.remove(key) : store.set(key, entry, ttl)
        ).pipe(Effect.orDie);
        return result;
      }).pipe(
        Effect.onExit((exit) =>
          Effect.sync(() => local.delete(key)).pipe(
            Effect.andThen(Deferred.done(deferred, exit)),
          ),
        ),
      );
      const fiber = yield* Effect.forkDetach(work);
      return yield* Fiber.join(fiber);
    }),
  );
}

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
          status: error.status,
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
