import { untrack } from 'svelte';
import {
  SubscriptionObserver,
  type SubscriptionStatus,
  type TrpcSubscriptionOptions,
} from '@trpc12/tanstack-query';

/**
 * What {@link createSubscription} returns. The fields are reactive getters,
 * like `createQuery`'s result: don't destructure them.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface CreateSubscriptionResult<TEvent, TError> {
  readonly status: SubscriptionStatus;
  /** The latest event. */
  readonly data: TEvent | undefined;
  readonly error: TError | null;
  /** Clears the state and subscribes again. */
  reset: () => void;
}

/**
 * Subscribes while the component is mounted. The getter is tracked, so a
 * new input restarts the subscription. Nothing runs during SSR.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   let from = $state(10);
 *   const sub = createSubscription(() =>
 *     trpc.clock.ticks.subscriptionOptions({ input: { from } }),
 *   );
 * </script>
 *
 * <p>{sub.data}</p>
 * ```
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export function createSubscription<TEvent, TError>(
  options: () => TrpcSubscriptionOptions<TEvent, TError>,
): CreateSubscriptionResult<TEvent, TError> {
  const observer = new SubscriptionObserver(untrack(options));
  let result = $state.raw(observer.getCurrentResult());
  $effect.pre(() => {
    observer.setOptions(options());
  });
  $effect(() => {
    const unsubscribe = observer.subscribe((next) => (result = next));
    result = observer.getCurrentResult();
    return unsubscribe;
  });
  return {
    get status() {
      return result.status;
    },
    get data() {
      return result.data;
    },
    get error() {
      return result.error;
    },
    reset: observer.reset,
  };
}
