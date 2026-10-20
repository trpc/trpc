/**
 * The API `.agent-docs/open/live-query-row-selection.md` proposes, as types:
 * B's on-demand `liveCollectionOptions`, which opens one subscription per
 * subset TanStack DB loads, and `toInput`, which turns a subset's simple
 * predicates into the subscription's input. A is `liveCollectionOptions` as
 * it is, eager only.
 */
import type { CollectionConfig, LoadSubsetOptions } from '@tanstack/db';
import type {
  LiveCollectionConfig,
  LiveSubscribe,
  LiveUtils,
} from '@trpc12/experimental-tanstack-db';

/** B: the options, with `syncMode` and a `subscribe` that gets the subset. */
export interface LiveCollectionConfigB<
  TRow extends object,
  TKey extends string | number,
> extends Omit<LiveCollectionConfig<TRow, TKey>, 'subscribe'> {
  readonly syncMode?: 'eager' | 'on-demand';
  readonly subscribe: (
    opts: Parameters<LiveSubscribe<TRow, TKey>>[0],
    subset: LoadSubsetOptions,
  ) => ReturnType<LiveSubscribe<TRow, TKey>>;
}

export declare function liveCollectionOptionsB<
  TRow extends object,
  TKey extends string | number = string | number,
>(
  config: LiveCollectionConfigB<TRow, TKey>,
): CollectionConfig<TRow, TKey, never, LiveUtils> & { utils: LiveUtils };

/**
 * B: a subset's `where` as an input: `eq()` on an allowed field becomes that
 * field's value. Other predicates are left out, which over-fetches.
 */
export declare function toInputB<TField extends string>(
  where: LoadSubsetOptions['where'],
  opts: { allow: ReadonlyArray<TField> },
): { [K in TField]: any };
