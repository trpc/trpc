import { toAsyncIterable } from '../internal/effects.ts';
import { setSubscriptionIterator, type AnyLink } from './link.ts';

/**
 * Marks a link that carries subscriptions, so `subscribe()` can hand their
 * events out as an `AsyncIterable` (Effect's `Stream.toAsyncIterable`). The
 * built-in links that carry them do this; a custom link that ends a
 * subscription's chain needs it, and a client whose chain has none fails
 * `subscribe()` with `CLIENT_ERROR`. Keeping the iterator here keeps it out
 * of clients that never subscribe.
 *
 * @example
 * ```ts
 * const eventsLink = withSubscriptions(
 *   link(({ op, next }) => (op.type === 'subscription' ? events(op) : next(op))),
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export const withSubscriptions = <L extends AnyLink>(target: L): L =>
  setSubscriptionIterator(target, toAsyncIterable);
