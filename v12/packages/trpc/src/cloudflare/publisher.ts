import { type Context, Effect, Layer, Stream } from 'effect';
import { HibernationSlot } from '../internal/hibernation.ts';
import {
  memoryPublisher,
  type PublisherClass,
  type PublisherEvents,
  type PublisherShape,
  tracked,
} from '../server/subscriptions/index.ts';
import { deliveries, type HibernationState } from './hibernation.ts';

/**
 * @since 0.1.0
 * @stability experimental
 */
export interface HibernatingPublisherOptions {
  /** The Durable Object's `ctx`, the same one `experimental_createHibernatingWebSockets` gets. */
  readonly state: HibernationState;
  /**
   * Events kept per channel for subscribers that resume with `lastEventId`.
   * They're in memory, so they're lost when the object is evicted.
   * @default 0
   */
  readonly buffer?: number;
}

/**
 * A publisher layer for a Durable Object that serves hibernating WebSockets.
 * A subscription that returns `Posts.subscribe(...)` over such a socket is
 * kept in the socket's attachment instead of a running fiber, and
 * `publish` sends events straight to the matching sockets, so the object
 * sleeps between events. Event ids are timestamps, so they keep growing
 * after the object wakes. Subscribers over SSE, or past the attachment
 * limit, get a running stream as with `Posts.memory()`.
 *
 * @example
 * ```ts
 * class Posts extends experimental_Publisher.Service<Posts, { created: Post }>()('Posts') {}
 *
 * export class Room extends DurableObject<Env> {
 *   handler = createFetchHandler({
 *     router,
 *     layer: experimental_hibernatingPublisher(Posts, { state: this.ctx, buffer: 100 }),
 *   });
 *   sockets = experimental_createHibernatingWebSockets(this.handler, { state: this.ctx });
 * }
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_hibernatingPublisher<
  Self,
  Key extends string,
  TEvents extends PublisherEvents,
>(
  publisher: PublisherClass<Self, Key, TEvents>,
  opts: HibernatingPublisherOptions,
): Layer.Layer<Self> {
  const tag = publisher as unknown as Context.Key<
    Self,
    PublisherShape<TEvents>
  >;
  const key = publisher.key;
  return Layer.effect(tag)(
    Effect.map(
      memoryPublisher({
        buffer: opts.buffer ?? 0,
        nextId: (last) => Math.max(Date.now() * 1000, last + 1),
      }),
      (memory) => {
        const shape: PublisherShape<PublisherEvents> = {
          publish: (channel, data) =>
            Effect.tap(memory.shape.publish(channel, data), (id) =>
              Effect.suspend(
                () =>
                  deliveries.get(opts.state)?.(
                    key,
                    channel,
                    tracked(id, data),
                  ) ?? Effect.void,
              ),
            ),
          subscribe: (channel, o) =>
            Stream.unwrap(
              Effect.gen(function* () {
                const slot = yield* HibernationSlot;
                return slot?.park({ key, channel })
                  ? Stream.fromIterable(memory.replay(channel, o?.lastEventId))
                  : memory.shape.subscribe(channel, o);
              }),
            ) as never,
        };
        return shape as PublisherShape<TEvents>;
      },
    ),
  );
}
