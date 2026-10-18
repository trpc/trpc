import { tracked, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { LiveMessage, RowKey } from '../protocol';

export interface LiveFeedResolveOpts<TInput, TCtx> {
  input: TInput;
  ctx: TCtx;
  /** Last version the client applied for this feed, or `null` for a snapshot */
  since: number | null;
  signal: AbortSignal;
}

export interface LiveFeedDef<TInput, TRow, TKey extends RowKey, TCtx> {
  input: z.ZodType<TInput>;
  resolve: (
    opts: LiveFeedResolveOpts<TInput, TCtx>,
  ) => AsyncIterable<LiveMessage<TRow, TKey>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyLiveFeed = LiveFeedDef<any, any, any, any>;

export function liveFeed<TInput, TRow, TKey extends RowKey, TCtx = unknown>(
  def: LiveFeedDef<TInput, TRow, TKey, TCtx>,
) {
  return def;
}

type FeedInput<T> = T extends LiveFeedDef<infer I, any, any, any> ? I : never;
type FeedRow<T> = T extends LiveFeedDef<any, infer R, any, any> ? R : never;
type FeedKey<T> = T extends LiveFeedDef<any, any, infer K, any> ? K : never;

/**
 * Input of the multiplexed stream: every live query the client currently
 * wants, keyed by a client-chosen subscription id.
 */
export interface MuxInput<TFeeds extends Record<string, AnyLiveFeed>> {
  subs: Record<
    string,
    {
      [K in keyof TFeeds & string]: {
        feed: K;
        input: FeedInput<TFeeds[K]>;
        since: number | null;
      };
    }[keyof TFeeds & string]
  >;
  lastEventId?: string | null;
}

export type MuxEvent<TFeeds extends Record<string, AnyLiveFeed>> = {
  [K in keyof TFeeds & string]: {
    sub: string;
    feed: K;
    message: LiveMessage<FeedRow<TFeeds[K]>, FeedKey<TFeeds[K]>>;
  };
}[keyof TFeeds & string];

const muxInputSchema = z.object({
  subs: z.record(
    z.string(),
    z.object({
      feed: z.string(),
      input: z.unknown(),
      since: z.number().int().nullable(),
    }),
  ),
  lastEventId: z.string().nullish(),
});

function parseCursorMap(lastEventId: string | null | undefined) {
  if (!lastEventId) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(lastEventId);
    return z.record(z.string(), z.number().int()).parse(parsed);
  } catch {
    return {};
  }
}

/**
 * Pools any number of live queries into a single subscription procedure.
 *
 * The event id of every yielded message is the JSON-encoded map of
 * `subId -> last version`, so a reconnect through the regular `lastEventId`
 * mechanism resumes every pooled query at once. The server holds no state
 * between connections.
 */
export function createLiveMux<TFeeds extends Record<string, AnyLiveFeed>>(
  feeds: TFeeds,
) {
  const input = muxInputSchema as unknown as z.ZodType<
    MuxInput<TFeeds>,
    MuxInput<TFeeds>
  >;

  async function* stream(opts: {
    input: MuxInput<TFeeds>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: any;
    signal: AbortSignal | undefined;
  }) {
    const resumed = parseCursorMap(opts.input.lastEventId);
    const cursors: Record<string, number> = {};
    const ac = new AbortController();
    const abort = () => ac.abort();
    opts.signal?.addEventListener('abort', abort);

    const queue: MuxEvent<TFeeds>[] = [];
    let failure: { error: unknown } | null = null;
    let wake: (() => void) | null = null;
    const notify = () => {
      wake?.();
      wake = null;
    };
    ac.signal.addEventListener('abort', notify);

    const prepared = Object.entries(opts.input.subs).map(([sub, spec]) => {
      const feed = feeds[spec.feed];
      if (!feed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Unknown live feed "${spec.feed}"`,
        });
      }
      return {
        sub,
        spec,
        feed,
        feedInput: feed.input.parse(spec.input) as unknown,
      };
    });

    for (const { sub, spec, feed, feedInput } of prepared) {
      const since = resumed[sub] ?? spec.since;
      if (since !== null) {
        cursors[sub] = since;
      }
      void (async () => {
        const iterable = feed.resolve({
          input: feedInput,
          ctx: opts.ctx,
          since,
          signal: ac.signal,
        });
        for await (const message of iterable) {
          queue.push({ sub, feed: spec.feed, message } as MuxEvent<TFeeds>);
          notify();
        }
      })().catch((error: unknown) => {
        failure ??= { error };
        notify();
      });
    }

    try {
      while (!ac.signal.aborted) {
        if (failure) {
          throw (failure as { error: unknown }).error;
        }
        const event = queue.shift();
        if (!event) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          continue;
        }
        cursors[event.sub] = event.message.version;
        yield tracked(JSON.stringify(cursors), event);
      }
    } finally {
      ac.abort();
      opts.signal?.removeEventListener('abort', abort);
    }
  }

  return { feeds, input, stream };
}
