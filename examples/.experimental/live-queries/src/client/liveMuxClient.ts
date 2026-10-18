import type { LiveMessage, RowKey } from '../protocol';
import type { LiveTransport, LiveTransportHandlers } from './transport';

interface AnyMuxInput {
  subs: Record<string, { feed: string; input: unknown; since: number | null }>;
}

interface AnyMuxEvent {
  sub: string;
  feed: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: LiveMessage<any, any>;
}

/**
 * Structural type of the vanilla client's pooled stream procedure, e.g.
 * `client.live.subscribe`.
 */
export interface LiveMuxProcedure<
  TInput extends AnyMuxInput,
  TEvent extends AnyMuxEvent,
> {
  subscribe(
    input: TInput,
    opts: {
      onData?: (data: { id: string; data: TEvent }) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onError?: (err: any) => void;
    },
  ): { unsubscribe(): void };
}

type FeedNames<TEvent extends AnyMuxEvent> = TEvent['feed'];

type FeedInputOf<
  TInput extends AnyMuxInput,
  TFeed extends string,
> = Extract<TInput['subs'][string], { feed: TFeed }>['input'];

type FeedMessageOf<TEvent extends AnyMuxEvent, TFeed extends string> = Extract<
  TEvent,
  { feed: TFeed }
>['message'];

type RowOf<TMessage> =
  TMessage extends LiveMessage<infer TRow, RowKey> ? TRow : never;
type KeyOf<TMessage> =
  TMessage extends LiveMessage<unknown, infer TKey> ? TKey : never;

interface MuxSlot {
  feed: string;
  input: unknown;
  version: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlers: LiveTransportHandlers<any, any>;
}

export interface LiveMuxClientOptions<
  TInput extends AnyMuxInput,
  TEvent extends AnyMuxEvent,
> {
  procedure: LiveMuxProcedure<TInput, TEvent>;
  /**
   * Coalesce subscribe/unsubscribe calls made within this window into a
   * single reconnect of the pooled stream.
   * @default 10
   */
  debounceMs?: number;
}

/**
 * Client side of `createLiveMux()`: every live query registered here shares
 * one subscription (one WebSocket message stream or one SSE connection).
 *
 * Changing the set of queries reopens the stream with each query's last
 * applied version, so already-synced queries resume with deltas rather than
 * a new snapshot.
 */
export function createLiveMuxClient<
  TInput extends AnyMuxInput,
  TEvent extends AnyMuxEvent,
>(opts: LiveMuxClientOptions<TInput, TEvent>) {
  const slots = new Map<string, MuxSlot>();
  const debounceMs = opts.debounceMs ?? 10;
  let nextId = 0;
  let current: { unsubscribe(): void } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let opened = 0;

  function reopen() {
    timer = null;
    current?.unsubscribe();
    current = null;
    if (slots.size === 0) {
      return;
    }
    const subs: AnyMuxInput['subs'] = {};
    for (const [id, slot] of slots) {
      subs[id] = { feed: slot.feed, input: slot.input, since: slot.version };
    }
    opened++;
    current = opts.procedure.subscribe({ subs } as TInput, {
      onData({ data }) {
        const slot = slots.get(data.sub);
        if (!slot) {
          return;
        }
        slot.version = data.message.version;
        slot.handlers.onMessage(data.message);
      },
      onError(err) {
        for (const slot of slots.values()) {
          slot.handlers.onError(err);
        }
      },
    });
  }

  function schedule() {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(reopen, debounceMs);
  }

  return {
    feed<TFeed extends FeedNames<TEvent>>(
      feed: TFeed,
      input: FeedInputOf<TInput, TFeed>,
    ): LiveTransport<
      RowOf<FeedMessageOf<TEvent, TFeed>>,
      KeyOf<FeedMessageOf<TEvent, TFeed>>
    > {
      return {
        subscribe(handlers) {
          const id = `s${nextId++}`;
          slots.set(id, { feed, input, version: null, handlers });
          schedule();
          return () => {
            slots.delete(id);
            schedule();
          };
        },
      };
    },
    /** Number of times the pooled stream has been (re)opened. */
    get openCount() {
      return opened;
    },
    get activeFeeds() {
      return slots.size;
    },
  };
}
