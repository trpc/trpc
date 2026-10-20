/**
 * The APIs `.agent-docs/open/live-query-pooling.md` proposes, as types: B's
 * pooled live subscription (`liveFeeds` on the server, `createLivePool` on
 * the client), C's subscription batching in `httpLink`. A is `wsLink`, or SSE
 * over HTTP/2, as it is; D is a wire protocol, with no API of its own.
 */
import type { Stream } from 'effect';
import type {
  LiveEvent,
  LiveSubscribe,
} from '@trpc12/experimental-tanstack-db';
import type { HttpLinkOptions, TrpcLink } from '@trpc12/trpc/client';
import type { TrackedEnvelope } from '@trpc12/trpc/server';
import type { z } from 'zod';

/** B: one live query of a pool: its input, and the rows it syncs. */
export interface LiveFeedB<TInput, TRow> {
  (opts: {
    input: TInput;
    lastEventId: string | undefined;
  }): Stream.Stream<TrackedEnvelope<LiveEvent<TRow, string>>>;
}

type AnyFeeds = Record<string, LiveFeedB<any, any>>;

/** B: the pooled subscription's input: the open queries, by id. */
export interface PooledInputB {
  subs: Record<string, { feed: string; input: unknown }>;
}
export declare const PooledInputB: z.ZodType<PooledInputB>;

/** B: an event of the pooled subscription, for the query `sub`. */
export interface PooledEventB {
  sub: string;
  event: LiveEvent<unknown, string>;
}

/** B: the pooled subscription's resolver; each event id is a JSON cursor of every query's id. */
export declare function liveFeedsB<TFeeds extends AnyFeeds>(
  feeds: TFeeds,
): (opts: {
  input: PooledInputB;
  lastEventId?: string | undefined;
  signal: AbortSignal;
}) => Stream.Stream<TrackedEnvelope<PooledEventB>>;

/** B: the client half: `feed(name, input)` is a `subscribe` for `liveCollectionOptions`. */
export interface LivePoolB<TFeeds extends AnyFeeds> {
  feed<K extends keyof TFeeds & string>(
    name: K,
    input: TFeeds[K] extends LiveFeedB<infer I, any> ? I : never,
  ): LiveSubscribe<
    TFeeds[K] extends LiveFeedB<any, infer R> ? R : never,
    string
  >;
}

export declare function createLivePoolB<TFeeds extends AnyFeeds>(
  subscribe: (
    input: PooledInputB,
    opts: { signal: AbortSignal; lastEventId?: string },
  ) => AsyncIterable<{ id: string; data: PooledEventB }>,
): LivePoolB<TFeeds>;

/** C: `httpLink` with `batch: { subscriptions: true }`. */
export declare function httpLinkC(
  opts: Omit<HttpLinkOptions, 'batch'> & {
    batch?: boolean | { maxItems?: number; subscriptions?: boolean };
  },
): TrpcLink<any>;
