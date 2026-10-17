import {
  Clock,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Layer,
  Option,
  type Cause,
  type Scope,
} from 'effect';
import { Redis } from 'effect/persistence';
import { TrpcError, type TaggedErrorClass } from '../internal/error.ts';
import type { Unset } from '../internal/types.ts';
import {
  makeEffectMiddleware,
  type EffectMiddleware,
  type MiddlewareRequirements,
  type ReqCtx,
  type ReqInput,
  type ReqMeta,
} from './middleware.ts';

/**
 * How long a lock may be held and waited for. A holder that outlives `ttl`
 * loses the lock, so it also bounds how long a crashed holder blocks others.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_LockOptions {
  /** @default '30 seconds' */
  readonly ttl?: Duration.Input;
  /** How long to wait for the lock before failing. @default '10 seconds' */
  readonly timeout?: Duration.Input;
}

/**
 * A held lock. `waited` is `true` when another holder had it first.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_Lock {
  readonly waited: boolean;
}

const LockTimeoutBase: new (args: {
  readonly key: string;
}) => Cause.YieldableError & {
  readonly _tag: 'LockTimeout';
  readonly key: string;
} = Data.TaggedError('LockTimeout');

/**
 * {@link experimental_Locker}'s failure when `timeout` passes first.
 * @since 0.1.0
 * @stability experimental
 */
export class experimental_LockTimeout extends LockTimeoutBase {}

/**
 * What an {@link experimental_Locker} layer provides. The lock is held until
 * the acquiring scope closes, or `ttl` passes. Store failures are defects.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_LockerShape {
  readonly acquire: (
    key: string,
    options?: experimental_LockOptions,
  ) => Effect.Effect<experimental_Lock, experimental_LockTimeout, Scope.Scope>;
}

/**
 * Keys calls that must not run at the same time, across instances when the
 * layer is shared: {@link experimental_memoryLocker} for one process,
 * {@link experimental_redisLocker} for many, and `experimental_durableLocker`
 * from `@trpc12/trpc/cloudflare` on Workers.
 *
 * @example
 * ```ts
 * Effect.scoped(
 *   Effect.gen(function* () {
 *     const locker = yield* experimental_Locker;
 *     yield* locker.acquire(`invoice:${id}`);
 *     return yield* charge(id);
 *   }),
 * );
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_Locker {
  readonly _: unique symbol;
}

/**
 * The {@link experimental_Locker} key.
 * @since 0.1.0
 * @stability experimental
 */
export const experimental_Locker: Context.ServiceClass<
  experimental_Locker,
  '@trpc12/trpc/Locker',
  experimental_LockerShape
> = Context.Service<experimental_Locker, experimental_LockerShape>()(
  '@trpc12/trpc/Locker',
);

const resolve = (
  defaults: experimental_LockOptions,
  options: experimental_LockOptions | undefined,
) => ({
  ttl: Duration.fromInputUnsafe(options?.ttl ?? defaults.ttl ?? '30 seconds'),
  timeout: Duration.fromInputUnsafe(
    options?.timeout ?? defaults.timeout ?? '10 seconds',
  ),
});

const expireAfter = (ttl: Duration.Duration, release: Effect.Effect<void>) =>
  Effect.forkScoped(Effect.andThen(Effect.sleep(ttl), release));

interface MemoryEntry {
  holder: object;
  waiters: Array<{
    readonly token: object;
    readonly granted: Deferred.Deferred<void>;
  }>;
}

/**
 * An {@link experimental_Locker} in this process's memory. Waiters get the
 * lock in order, without polling.
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_memoryLocker(
  options: experimental_LockOptions = {},
): Layer.Layer<experimental_Locker> {
  return Layer.sync(experimental_Locker, () => {
    const entries = new Map<string, MemoryEntry>();
    const release = (key: string, token: object) =>
      Effect.sync(() => {
        const entry = entries.get(key);
        if (!entry) return;
        if (entry.holder !== token) {
          entry.waiters = entry.waiters.filter((w) => w.token !== token);
          return;
        }
        const next = entry.waiters.shift();
        if (!next) {
          entries.delete(key);
          return;
        }
        entry.holder = next.token;
        Deferred.doneUnsafe(next.granted, Effect.void);
      });
    return {
      acquire: (key, opts) =>
        Effect.gen(function* () {
          const resolved = resolve(options, opts);
          const token = {};
          yield* Effect.addFinalizer(() => release(key, token));
          const entry = entries.get(key);
          if (!entry) {
            entries.set(key, { holder: token, waiters: [] });
          } else {
            const granted = Deferred.makeUnsafe<void>();
            entry.waiters.push({ token, granted });
            const got = yield* Effect.timeoutOption(
              Deferred.await(granted),
              resolved.timeout,
            );
            if (Option.isNone(got) && entries.get(key)?.holder !== token) {
              return yield* new experimental_LockTimeout({ key });
            }
          }
          yield* expireAfter(resolved.ttl, release(key, token));
          return { waited: entry !== undefined };
        }),
    };
  });
}

/**
 * Options for {@link experimental_redisLocker}.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_RedisLockerOptions extends experimental_LockOptions {
  /** @default 'trpc:lock:' */
  readonly prefix?: string;
  /** How often a held lock is tried again. @default '100 millis' */
  readonly retryInterval?: Duration.Input;
}

const releaseScript = Redis.script(
  (key: string, token: string) => [key, token],
  {
    numberOfKeys: 1,
    lua: `if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`,
  },
);

/**
 * An {@link experimental_Locker} on Effect's `Redis` service
 * (`effect/persistence`): `SET NX PX` to take a lock, a token-checked
 * delete to release it. Any client Effect's `Redis` wraps works, e.g.
 * `NodeRedis.layer` from `@effect/platform-node`.
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_redisLocker(
  options: experimental_RedisLockerOptions = {},
): Layer.Layer<experimental_Locker, never, Redis.Redis> {
  const prefix = options.prefix ?? 'trpc:lock:';
  const retry = Duration.toMillis(
    Duration.fromInputUnsafe(options.retryInterval ?? '100 millis'),
  );
  return Layer.effect(
    experimental_Locker,
    Effect.gen(function* () {
      const redis = yield* Redis.Redis;
      const release = (key: string, token: string) =>
        Effect.ignore(redis.eval(releaseScript)(key, token));
      return {
        acquire: (key, opts) =>
          Effect.gen(function* () {
            const resolved = resolve(options, opts);
            const stored = prefix + key;
            const token = crypto.randomUUID();
            yield* Effect.addFinalizer(() => release(stored, token));
            const deadline =
              (yield* Clock.currentTimeMillis) +
              Duration.toMillis(resolved.timeout);
            let waited = false;
            while (true) {
              const set = yield* Effect.orDie(
                redis.send(
                  'SET',
                  stored,
                  token,
                  'NX',
                  'PX',
                  String(Math.max(1, Duration.toMillis(resolved.ttl))),
                ),
              );
              if (set === 'OK') return { waited };
              const left = deadline - (yield* Clock.currentTimeMillis);
              if (left <= 0) {
                return yield* new experimental_LockTimeout({ key });
              }
              waited = true;
              yield* Effect.sleep(Math.min(retry, left));
            }
          }),
      };
    }),
  );
}

const LockConflictBase: TaggedErrorClass<'CONFLICT', undefined, 409> =
  TrpcError.Tagged('CONFLICT', {
    status: 409,
    message: 'Another call holds the lock',
  });

/**
 * The error {@link experimental_lock} fails with when the lock isn't free
 * within `timeout`: `409`.
 * @since 0.1.0
 * @stability experimental
 */
export class experimental_LockConflict extends LockConflictBase {}

/**
 * Options for {@link experimental_lock}.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_LockMiddlewareOptions<
  TCtx,
  TInput,
  TMeta,
> extends experimental_LockOptions {
  /** The work that must not overlap, e.g. `({ input }) => \`invoice:${input.id}\``. */
  readonly key: (opts: {
    readonly ctx: TCtx;
    readonly input: TInput;
    readonly meta: TMeta;
    readonly path: string;
  }) => string;
}

const HeldLocks = Context.Reference<ReadonlyMap<string, boolean>>(
  '@trpc12/trpc/HeldLocks',
  { defaultValue: () => new Map() },
);

/**
 * Runs the rest of the call under an {@link experimental_Locker} lock, so
 * calls with the same key never overlap. Adds `ctx.lock` (`{ waited }`).
 * Fails with {@link experimental_LockConflict} after `timeout`. A key this
 * call already holds, from another `experimental_lock` before it, is not
 * taken again. The lock covers the resolver: a streamed output or a
 * subscription runs after it is released.
 *
 * @example
 * ```ts
 * const pay = t.procedure
 *   .input(z.object({ invoice: z.string() }))
 *   .use(experimental_lock({ key: ({ input }) => `invoice:${input.invoice}` }))
 *   .mutation(…);
 *
 * createFetchHandler({ router, layer: experimental_memoryLocker() });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_lock<TReq extends MiddlewareRequirements = {}>(
  options: experimental_LockMiddlewareOptions<
    ReqCtx<TReq>,
    ReqInput<TReq>,
    ReqMeta<TReq>
  >,
): EffectMiddleware<
  ReqCtx<TReq>,
  ReqInput<TReq>,
  ReqMeta<TReq>,
  { readonly lock: experimental_Lock },
  experimental_LockConflict,
  experimental_Locker,
  never,
  never,
  Unset
> {
  return makeEffectMiddleware((opts: any) =>
    Effect.gen(function* () {
      const key = options.key(opts);
      const held = yield* HeldLocks;
      const waited = held.get(key);
      if (waited !== undefined) {
        return yield* opts.next({ ctx: { lock: { waited } } });
      }
      const locker = yield* experimental_Locker;
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const lock = yield* locker
            .acquire(key, options)
            .pipe(
              Effect.catchTag('LockTimeout', () =>
                Effect.fail(new experimental_LockConflict()),
              ),
            );
          return yield* opts
            .next({ ctx: { lock } })
            .pipe(
              Effect.provideService(
                HeldLocks,
                new Map(held).set(key, lock.waited),
              ),
            );
        }),
      );
    }),
  );
}
