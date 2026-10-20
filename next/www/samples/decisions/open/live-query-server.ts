/**
 * The APIs `.agent-docs/open/live-query-server.md` proposes, as types: B's
 * `snapshot` option on `experimental_Publisher`'s `subscribe()`, C's
 * `@trpc12/trpc/live` (`Live.Source` and `Live.feed`), D's `.live()`
 * procedure with its query and collection options. A is the docs recipe,
 * on v12 as it is.
 */
import type { CollectionConfig } from '@tanstack/db';
import type { Context, Effect, Layer, Stream } from 'effect';
import type { LiveEvent, LiveUtils } from '@trpc12/experimental-tanstack-db';
import type {
  AnyProcedureBuilder,
  experimental_Publisher,
  PublisherClass,
  PublisherEvents,
  ResolverOpts,
  SubscribeOptions,
  TrackedEnvelope,
} from '@trpc12/trpc/server';

/** B: a publisher whose `subscribe()` takes a `snapshot`, read after it subscribes. */
export type PublisherClassB<
  Self,
  Key extends string,
  TEvents extends PublisherEvents,
> = PublisherClass<Self, Key, TEvents> & {
  subscribe<K extends keyof TEvents & string, TSnapshot>(
    channel: K,
    opts: SubscribeOptions & {
      /** Runs once subscribed; its value comes first, with the publisher's latest id. */
      readonly snapshot: Effect.Effect<TSnapshot>;
    },
  ): Stream.Stream<TrackedEnvelope<TEvents[K] | TSnapshot>, never, Self>;
};

/** B: `experimental_Publisher` with B's `subscribe()`. */
export declare const experimental_PublisherB: {
  Service: <Self, TEvents extends PublisherEvents>() => <
    const Key extends string,
  >(
    key: Key,
  ) => PublisherClassB<Self, Key, TEvents>;
} & Omit<typeof experimental_Publisher, 'Service'>;

/** C: what a live source does. */
export interface LiveSourceShapeC<TRow> {
  readonly rows: Effect.Effect<ReadonlyArray<TRow>>;
}

/** C: a write to a source's rows. */
export interface LiveDraftC<TRow> {
  set(row: TRow): void;
  delete(key: string | number): void;
}

/** C: a source key, with its in-memory layer and its writes. */
export interface LiveSourceClassC<
  Self,
  Key extends string,
  TRow,
> extends Context.ServiceClass<Self, Key, LiveSourceShapeC<TRow>> {
  memory(opts: { getKey: (row: TRow) => string | number }): Layer.Layer<Self>;
  /** Commits a write; succeeds with the source's new version. */
  mutate(
    write: (draft: LiveDraftC<TRow>) => void,
  ): Effect.Effect<number, never, Self>;
}

/** C: `Live` from `@trpc12/trpc/live`. */
export declare const LiveC: {
  Source<Self, TRow>(): <const Key extends string>(
    key: Key,
  ) => LiveSourceClassC<Self, Key, TRow>;
  /** A source's rows as a live subscription: a snapshot or the missed versions, then each change. */
  feed<Self, TRow>(
    source: LiveSourceClassC<Self, string, TRow>,
    opts: {
      lastEventId?: string | undefined;
      where?: (row: TRow) => boolean;
    },
  ): Stream.Stream<TrackedEnvelope<LiveEvent<TRow>>, never, Self>;
};

/** D: a live procedure: a query of its rows and a subscription of their changes. */
export interface LiveProcedureD<TInput, TRow extends object, TKey> {
  readonly '~live': { input: TInput; row: TRow; key: TKey };
}

type DefOf<B extends AnyProcedureBuilder> = NonNullable<B['~trpc']['~types']>;

/** D: a builder with `.live()`. */
export type LiveableD<B extends AnyProcedureBuilder> = B & {
  live<TRow extends object, TKey extends string | number>(opts: {
    getKey: (row: TRow) => TKey;
    source: LiveSourceClassC<any, string, TRow>;
    where?: (opts: ResolverOpts<DefOf<B>>) => (row: TRow) => boolean;
  }): LiveProcedureD<DefOf<B>['inputIn'], TRow, TKey>;
};

/** D: gives a builder `.live()`. */
export declare function liveableD<B extends AnyProcedureBuilder>(
  builder: B,
): LiveableD<B>;

/** D: the options proxy of a router with live procedures. */
export type LiveOptionsProxyD<TRouter> = {
  [K in keyof TRouter]: TRouter[K] extends LiveProcedureD<
    infer I,
    infer R,
    infer TKey extends string | number
  >
    ? {
        queryOptions(input: I): {
          queryKey: ReadonlyArray<unknown>;
          queryFn: () => Promise<Array<R>>;
        };
        collectionOptions(
          input: I,
        ): CollectionConfig<R, TKey, never, LiveUtils> & { utils: LiveUtils };
      }
    : LiveOptionsProxyD<TRouter[K]>;
};
