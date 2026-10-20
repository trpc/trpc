/**
 * The API `.agent-docs/open/tanstack-db-live-package.md` proposes, as types:
 * D's `collectionOptions()` on the options proxy, a live collection's options
 * for a subscription procedure. A is `liveCollectionOptions` in
 * `@trpc12/experimental-tanstack-db` as it is, B the query collection recipe,
 * C the same function from `@trpc12/tanstack-query`.
 */
import type { CollectionConfig } from '@tanstack/db';
import type { TrpcSubscription } from '@trpc12/trpc/client';
import type {
  LiveEvent,
  LiveUtils,
  TrackedLiveEvent,
} from '@trpc12/experimental-tanstack-db';

type RowOf<T> =
  T extends TrackedLiveEvent<infer R, any>
    ? R
    : T extends LiveEvent<infer R, any>
      ? R
      : never;

/** D: a subscription procedure's `collectionOptions()`. */
export interface LiveCollectionOptionsD<TInput, TRow extends object> {
  collectionOptions<TKey extends string | number>(opts: {
    input: TInput;
    getKey: (row: TRow) => TKey;
  }): CollectionConfig<TRow, TKey, never, LiveUtils> & { utils: LiveUtils };
}

/** D: the options proxy of a client, with `collectionOptions()` on its subscriptions. */
export type LiveOptionsProxyD<TClient> = {
  [K in keyof TClient]: TClient[K] extends {
    subscribe(input: infer I, ...rest: any[]): TrpcSubscription<infer T, any>;
  }
    ? RowOf<T> extends infer R extends object
      ? LiveCollectionOptionsD<I, R>
      : never
    : TClient[K] extends (...args: any[]) => any
      ? never
      : LiveOptionsProxyD<TClient[K]>;
};

export declare function createOptionsProxyD<TClient extends object>(opts: {
  client: TClient;
}): LiveOptionsProxyD<TClient>;
