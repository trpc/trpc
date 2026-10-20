/**
 * The APIs `.agent-docs/open/safe-client-iteration.md` proposes, as types:
 * B wraps a safe client's iterables too, C adds `.safe()` and
 * `safeSubscribe()`. A is `createSafeClient` as it is.
 */
import type {
  SafeResult,
  TrpcPromise,
  TrpcSubscription,
} from '@trpc12/trpc/client';

type SafeIterable<T, E> = AsyncIterable<SafeResult<T, E>>;

/** B: a streamed output and `subscribe()` yield `[item, error]`. */
export type SafeClientB<TClient> = {
  [K in keyof TClient]: TClient[K] extends (
    ...args: infer A
  ) => TrpcPromise<infer T, infer E>
    ? (
        ...args: A
      ) => Promise<
        SafeResult<T extends AsyncIterable<infer I> ? SafeIterable<I, E> : T, E>
      >
    : TClient[K] extends (
          ...args: infer A
        ) => TrpcSubscription<infer T, infer E>
      ? (...args: A) => SafeIterable<T, E>
      : TClient[K] extends (...args: any[]) => any
        ? TClient[K]
        : SafeClientB<TClient[K]>;
};

export declare function createSafeClientB<TClient extends object>(
  client: TClient,
): SafeClientB<TClient>;

/** C: a streamed output keeps its type and gains `.safe()`; a subscription gains `safeSubscribe()`. */
export type SafeClientC<TClient> = {
  [K in keyof TClient]: TClient[K] extends (
    ...args: infer A
  ) => TrpcPromise<infer T, infer E>
    ? (
        ...args: A
      ) => Promise<
        SafeResult<
          T extends AsyncIterable<infer I>
            ? T & { safe(): SafeIterable<I, E> }
            : T,
          E
        >
      >
    : TClient[K] extends (...args: any[]) => any
      ? TClient[K]
      : SafeClientC<TClient[K]>;
} & (TClient extends {
  subscribe(...args: infer A): TrpcSubscription<infer T, infer E>;
}
  ? { safeSubscribe(...args: A): SafeIterable<T, E> }
  : {});

export declare function createSafeClientC<TClient extends object>(
  client: TClient,
): SafeClientC<TClient>;
