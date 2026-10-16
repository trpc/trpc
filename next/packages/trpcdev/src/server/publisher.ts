import { Context, Effect, Layer, PubSub, Stream, type Scope } from 'effect';
import { tracked, type TrackedEnvelope } from './tracked.ts';

/**
 * Event types by channel: `{ created: Post; deleted: { id: string } }`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type PublisherEvents = Record<string, unknown>;

/**
 * What a publisher service does. Events carry ids, so subscribers resume
 * from `lastEventId` when the backend keeps history.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface PublisherShape<TEvents extends PublisherEvents> {
  /** Sends an event to the channel's subscribers. Succeeds with its id. */
  readonly publish: <K extends keyof TEvents & string>(
    channel: K,
    data: TEvents[K],
  ) => Effect.Effect<string>;
  /**
   * The channel's events as `tracked()` envelopes, so SSE and `wsLink` send
   * their ids. With `lastEventId`, kept events after it come first.
   */
  readonly subscribe: <K extends keyof TEvents & string>(
    channel: K,
    opts?: { readonly lastEventId?: string | undefined },
  ) => Stream.Stream<TrackedEnvelope<TEvents[K]>>;
}

/**
 * Options for the in-memory layer.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface MemoryPublisherOptions {
  /**
   * Events kept per channel for subscribers that resume with `lastEventId`.
   * `0` keeps none.
   * @default 0
   */
  readonly buffer?: number;
}

/**
 * The class `Publisher.Service` makes: a `Context` key for the publisher,
 * with an in-memory layer and accessors.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface PublisherClass<
  Self,
  Key extends string,
  TEvents extends PublisherEvents,
> extends Context.ServiceClass<Self, Key, PublisherShape<TEvents>> {
  /**
   * One process's publisher, on a `PubSub`. Use another layer for several
   * processes (Redis, Postgres `LISTEN`, Durable Objects).
   */
  memory(opts?: MemoryPublisherOptions): Layer.Layer<Self>;
  publish<K extends keyof TEvents & string>(
    channel: K,
    data: TEvents[K],
  ): Effect.Effect<string, never, Self>;
  subscribe<K extends keyof TEvents & string>(
    channel: K,
    opts?: { readonly lastEventId?: string | undefined },
  ): Stream.Stream<TrackedEnvelope<TEvents[K]>, never, Self>;
}

interface Event {
  readonly channel: string;
  readonly id: number;
  readonly data: unknown;
}

/**
 * The in-memory publisher, for a layer of your own key.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const makeMemoryPublisher = <TEvents extends PublisherEvents>(
  opts: MemoryPublisherOptions = {},
): Effect.Effect<PublisherShape<TEvents>, never, Scope.Scope> =>
  Effect.map(memoryPublisher(opts), (p) => p.shape as PublisherShape<TEvents>);

/** What a memory publisher keeps, for layers built on it. @internal */
export interface MemoryPublisher {
  readonly shape: PublisherShape<PublisherEvents>;
  /** Kept events of `channel` after `lastEventId`, as `tracked()` envelopes. */
  readonly replay: (
    channel: string,
    lastEventId: string | undefined,
  ) => TrackedEnvelope<unknown>[];
}

/** @internal */
export const memoryPublisher = (
  opts: MemoryPublisherOptions & {
    /** The id after `last`; ids compare as numbers. */
    readonly nextId?: (last: number) => number;
  } = {},
): Effect.Effect<MemoryPublisher, never, Scope.Scope> =>
  Effect.gen(function* () {
    const size = opts.buffer ?? 0;
    const nextId = opts.nextId ?? ((last) => last + 1);
    const pubsub = yield* Effect.acquireRelease(
      PubSub.unbounded<Event>(),
      PubSub.shutdown,
    );
    const kept = new Map<string, Event[]>();
    let seq = 0;

    const keptAfter = (channel: string, after: number) =>
      Number.isFinite(after)
        ? (kept.get(channel) ?? []).filter((e) => e.id > after)
        : [];

    const publish = (channel: string, data: unknown) =>
      Effect.suspend(() => {
        seq = nextId(seq);
        const event: Event = { channel, id: seq, data };
        if (size > 0) {
          const list = kept.get(channel) ?? [];
          list.push(event);
          if (list.length > size) list.splice(0, list.length - size);
          kept.set(channel, list);
        }
        return Effect.as(PubSub.publish(pubsub, event), String(event.id));
      });

    const subscribe = (
      channel: string,
      o?: { readonly lastEventId?: string | undefined },
    ) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const subscription = yield* PubSub.subscribe(pubsub);
          const after = o?.lastEventId ? Number(o.lastEventId) : Number.NaN;
          const replay = keptAfter(channel, after);
          const seen =
            replay.at(-1)?.id ?? (Number.isFinite(after) ? after : 0);
          const live = Stream.fromSubscription(subscription).pipe(
            Stream.filter((e) => e.channel === channel && e.id > seen),
          );
          return Stream.concat(Stream.fromIterable(replay), live).pipe(
            Stream.map((e) => tracked(String(e.id), e.data)),
          );
        }),
      );

    return {
      shape: { publish, subscribe } as PublisherShape<PublisherEvents>,
      replay: (channel, lastEventId) =>
        keptAfter(channel, lastEventId ? Number(lastEventId) : Number.NaN).map(
          (e) => tracked(String(e.id), e.data),
        ),
    };
  });

/**
 * Typed publish/subscribe as an Effect service (14 Q14.6). Declare a key
 * with its channels, provide a layer (in-memory, or your backend's), and
 * return `subscribe()` from a subscription: its events are `tracked()`, so
 * reconnects resume.
 *
 * @example
 * ```ts
 * class Posts extends Publisher.Service<Posts, { created: Post }>()('Posts') {}
 *
 * const router = {
 *   create: t.procedure.input(PostInput).mutation(({ input }) =>
 *     Effect.gen(function* () {
 *       const post = yield* savePost(input);
 *       yield* Posts.publish('created', post);
 *       return post;
 *     }),
 *   ),
 *   onCreated: t.procedure.subscription(({ lastEventId }) =>
 *     Posts.subscribe('created', { lastEventId }),
 *   ),
 * };
 * createFetchHandler({ router, layer: Posts.memory({ buffer: 100 }) });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const Publisher = {
  Service:
    <Self, TEvents extends PublisherEvents>() =>
    <const Key extends string>(
      key: Key,
    ): PublisherClass<Self, Key, TEvents> => {
      const Base = Context.Service<Self, PublisherShape<TEvents>>()(key);
      const tag = Base as unknown as Context.Key<Self, PublisherShape<TEvents>>;
      return Object.assign(Base, {
        memory: (opts?: MemoryPublisherOptions) =>
          Layer.effect(tag)(makeMemoryPublisher<TEvents>(opts)),
        publish: (channel: string, data: unknown) =>
          Effect.flatMap(tag, (p) => p.publish(channel, data as never)),
        subscribe: (
          channel: string,
          opts?: { readonly lastEventId?: string | undefined },
        ) => Stream.unwrap(Effect.map(tag, (p) => p.subscribe(channel, opts))),
      }) as never;
    },
};
