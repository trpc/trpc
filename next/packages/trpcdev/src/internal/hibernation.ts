import { Context } from 'effect';

/** A publisher subscription a hibernating socket can keep instead of a fiber. @internal */
export interface ParkedSubscription {
  /** The publisher's service key. */
  readonly key: string;
  readonly channel: string;
  /** The subscriber's tags, for events published with tags. */
  readonly tags?: ReadonlyArray<string> | undefined;
}

/**
 * Set for a subscription call on a hibernating socket. A hibernating
 * publisher asks it to `park` the subscription; when that succeeds, the
 * call's stream ends after the replayed events and the socket keeps the
 * subscription instead.
 * @internal
 */
export interface HibernationSlotShape {
  readonly park: (sub: ParkedSubscription) => boolean;
}

/** @internal */
export const HibernationSlot: Context.Reference<
  HibernationSlotShape | undefined
> = Context.Reference<HibernationSlotShape | undefined>(
  'trpcdev/HibernationSlot',
  { defaultValue: () => undefined },
);
