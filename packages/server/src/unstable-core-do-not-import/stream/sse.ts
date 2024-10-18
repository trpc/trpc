import { getTRPCErrorFromUnknown } from '../error/TRPCError';
import type { MaybePromise } from '../types';
import { identity, run } from '../utils';
import type { EventSourceLike } from './sse.types';
import type { inferTrackedOutput } from './tracked';
import { isTrackedEnvelope } from './tracked';
import { takeWithGrace, withCancel } from './utils/asyncIterable';
import { createDeferred } from './utils/createDeferred';
import { createReadableStream } from './utils/createReadableStream';
import type { PromiseTimer } from './utils/promiseTimer';
import { createPromiseTimer } from './utils/promiseTimer';
import { PING_SYM, withPing } from './utils/withPing';

type Serialize = (value: any) => any;
type Deserialize = (value: any) => any;

/**
 * @internal
 */
export interface PingOptions {
  /**
   * Enable ping comments sent from the server
   * @default false
   */
  enabled: boolean;
  /**
   * Interval in milliseconds
   * @default 1000
   */
  intervalMs?: number;
}

export interface SSEStreamProducerOptions<TValue = unknown> {
  serialize?: Serialize;
  data: AsyncIterable<TValue>;
  maxDepth?: number;
  ping?: PingOptions;
  /**
   * Maximum duration in milliseconds for the request before ending the stream
   * Only useful for serverless runtimes
   * @default undefined
   */
  maxDurationMs?: number;
  /**
   * End the request immediately after data is sent
   * Only useful for serverless runtimes that do not support streaming responses
   * @default false
   */
  emitAndEndImmediately?: boolean;
  formatError?: (opts: { error: unknown }) => unknown;
}

const SERIALIZED_ERROR_EVENT = 'serialized-error';

type SSEvent = Partial<{
  id: string;
  data: unknown;
  comment: string;
  event: string;
}>;
/**
 *
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export function sseStreamProducer<TValue = unknown>(
  opts: SSEStreamProducerOptions<TValue>,
) {
  const stream = createReadableStream<SSEvent>();
  stream.controller.enqueue({ comment: 'connected' });

  const { serialize = identity } = opts;

  const ping: Required<PingOptions> = {
    enabled: opts.ping?.enabled ?? false,
    intervalMs: opts.ping?.intervalMs ?? 1000,
  };

  run(async () => {
    let iterable: AsyncIterable<TValue | typeof PING_SYM> = opts.data;

    iterable = withCancel(iterable, stream.cancelledPromise);

    if (opts.emitAndEndImmediately) {
      iterable = takeWithGrace(iterable, { count: 1, gracePeriodMs: 1 });
    }

    let maxDurationTimer: PromiseTimer | null = null;
    if (
      opts.maxDurationMs != null &&
      opts.maxDurationMs > 0 &&
      opts.maxDurationMs !== Infinity
    ) {
      maxDurationTimer = createPromiseTimer(opts.maxDurationMs).start();
      iterable = withCancel(iterable, maxDurationTimer.promise);
    }

    if (ping.enabled && ping.intervalMs !== Infinity && ping.intervalMs > 0) {
      iterable = withPing(iterable, ping.intervalMs);
    }

    try {
      for await (const value of iterable) {
        if (value === PING_SYM) {
          stream.controller.enqueue({ comment: 'ping' });
          continue;
        }

        const chunk: SSEvent = isTrackedEnvelope(value)
          ? { id: value[0], data: value[1] }
          : { data: value };
        if ('data' in chunk) {
          chunk.data = JSON.stringify(serialize(chunk.data));
        }

        stream.controller.enqueue(chunk);
      }
    } catch (err) {
      // ignore abort errors, send any other errors
      if (!(err instanceof Error) || err.name !== 'AbortError') {
        // `err` must be caused by `opts.data`, `JSON.stringify` or `serialize`.
        // So, a user error in any case.
        const error = getTRPCErrorFromUnknown(err);
        const data = opts.formatError?.({ error }) ?? null;
        stream.controller.enqueue({
          event: SERIALIZED_ERROR_EVENT,
          data: JSON.stringify(serialize(data)),
        });
      }
    } finally {
      maxDurationTimer?.clear();
      stream.controller.close();
    }
  }).catch((err) => {
    // should not be reached; just in case...
    stream.controller.error(err);
  });

  return stream.readable.pipeThrough(
    new TransformStream<SSEvent, string>({
      transform(chunk, controller) {
        if ('event' in chunk) {
          controller.enqueue(`event: ${chunk.event}\n`);
        }
        if ('data' in chunk) {
          controller.enqueue(`data: ${chunk.data}\n`);
        }
        if ('id' in chunk) {
          controller.enqueue(`id: ${chunk.id}\n`);
        }
        if ('comment' in chunk) {
          controller.enqueue(`: ${chunk.comment}\n`);
        }
        controller.enqueue('\n\n');
      },
    }),
  );
}

interface ConsumerStreamResultBase<TConfig extends ConsumerConfig> {
  eventSource: InstanceType<TConfig['EventSource']>;
}

interface ConsumerStreamResultData<TConfig extends ConsumerConfig>
  extends ConsumerStreamResultBase<TConfig> {
  type: 'data';
  data: inferTrackedOutput<TConfig['data']>;
}

interface ConsumerStreamResultError<TConfig extends ConsumerConfig>
  extends ConsumerStreamResultBase<TConfig> {
  type: 'serialized-error';
  error: TConfig['error'];
}

interface ConsumerStreamResultOpened<TConfig extends ConsumerConfig>
  extends ConsumerStreamResultBase<TConfig> {
  type: 'opened';
}

interface ConsumerStreamResultConnecting<TConfig extends ConsumerConfig>
  extends ConsumerStreamResultBase<TConfig> {
  type: 'connecting';
  event: EventSourceLike.EventOf<TConfig['EventSource']> | null;
}

type ConsumerStreamResult<TConfig extends ConsumerConfig> =
  | ConsumerStreamResultData<TConfig>
  | ConsumerStreamResultError<TConfig>
  | ConsumerStreamResultOpened<TConfig>
  | ConsumerStreamResultConnecting<TConfig>;

export interface SSEStreamConsumerOptions<TConfig extends ConsumerConfig> {
  url: () => MaybePromise<string>;
  init: () => MaybePromise<EventSourceInit> | undefined;
  signal: AbortSignal;
  shouldRecreateOnError?: (
    opts:
      | {
          type: 'event';
          event: EventSourceLike.EventOf<TConfig['EventSource']>;
        }
      | {
          type: 'serialized-error';
          error: unknown;
        },
  ) => boolean | Promise<boolean>;
  deserialize?: Deserialize;
  EventSource: TConfig['EventSource'];
}

interface ConsumerConfig {
  data: unknown;
  error: unknown;
  EventSource: EventSourceLike.AnyConstructor;
}

/**
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export function sseStreamConsumer<TConfig extends ConsumerConfig>(
  opts: SSEStreamConsumerOptions<TConfig>,
): AsyncIterable<ConsumerStreamResult<TConfig>> {
  const { deserialize = (v) => v, shouldRecreateOnError } = opts;

  const signal = opts.signal;

  let eventSource: InstanceType<TConfig['EventSource']> | null = null;
  let lock: Promise<void> | null = null;

  const stream = createReadableStream<ConsumerStreamResult<TConfig>>();

  function createEventSource(...args: [string, EventSourceLike.InitDict?]) {
    const es = new opts.EventSource(...args) as InstanceType<
      TConfig['EventSource']
    >;

    if (signal.aborted) {
      es.close();
    } else {
      signal.addEventListener('abort', () => es.close());
    }

    /**
     * Dispatch an event to the stream controller
     *
     * Will be a no-op if the event source has been replaced
     */
    const dispatch = (
      fn: (controller: typeof stream.controller) => void | Promise<void>,
    ): void => {
      run(async () => {
        while (lock) {
          await lock;
        }
        if (es === eventSource) {
          await fn(stream.controller);
        }
      }).catch((error) => {
        stream.controller.error(error);
      });
    };

    const pauseDispatch = async (fn: () => Promise<void>): Promise<void> => {
      while (lock) {
        await lock;
      }
      if (es !== eventSource) {
        return;
      }

      const deferred = createDeferred<void>();
      lock = deferred.promise;
      try {
        await fn();
      } finally {
        lock = null;
        deferred.resolve();
      }
    };

    es.addEventListener('open', () => {
      dispatch((controller) => {
        controller.enqueue({
          type: 'opened',
          eventSource: es,
        });
      });
    });

    es.addEventListener(SERIALIZED_ERROR_EVENT, (_msg) => {
      const msg = _msg as EventSourceLike.MessageEvent;
      dispatch(async () => {
        if (shouldRecreateOnError) {
          await pauseDispatch(async () => {
            const recreate = await shouldRecreateOnError({
              type: SERIALIZED_ERROR_EVENT,
              error: deserialize(JSON.parse(msg.data)),
            });
            if (recreate) {
              await recreateEventSource();
            }
          });
        }
        dispatch((controller) => {
          controller.enqueue({
            type: 'serialized-error',
            error: deserialize(JSON.parse(msg.data)),
            eventSource: es,
          });
        });
      });
    });
    es.addEventListener('error', (event) => {
      dispatch(async () => {
        if (shouldRecreateOnError) {
          await pauseDispatch(async () => {
            const recreate = await shouldRecreateOnError({
              type: 'event',
              event,
            });
            if (recreate) {
              await recreateEventSource();
            }
          });
        }

        dispatch((controller) => {
          if (es.readyState === EventSource.CLOSED) {
            controller.error(event);
          } else {
            controller.enqueue({
              type: 'connecting',
              eventSource: es,
              event,
            });
          }
        });
      });
    });
    es.addEventListener('message', (_msg) => {
      const msg = _msg as EventSourceLike.MessageEvent;
      dispatch((controller) => {
        const chunk = deserialize(JSON.parse(msg.data));

        const def: SSEvent = {
          data: chunk,
        };
        if (msg.lastEventId) {
          def.id = msg.lastEventId;
        }
        controller.enqueue({
          type: 'data',
          data: def as inferTrackedOutput<TConfig['data']>,
          eventSource: es,
        });
      });
    });
    return es;
  }
  async function recreateEventSource() {
    eventSource?.close();
    const [url, init] = await Promise.all([opts.url(), opts.init()]);
    eventSource = createEventSource(url, init);
    stream.controller.enqueue({
      type: 'connecting',
      eventSource,
      event: null,
    });
  }

  recreateEventSource().catch(() => {
    // prevent unhandled promise rejection
  });
  return {
    [Symbol.asyncIterator]() {
      const reader = stream.readable.getReader();

      const iterator: AsyncIterator<ConsumerStreamResult<TConfig>> = {
        async next() {
          const value = await reader.read();

          if (value.done) {
            return {
              value: undefined,
              done: true,
            };
          }
          return {
            value: value.value,
            done: false,
          };
        },
        async return() {
          reader.releaseLock();
          return {
            value: undefined,
            done: true,
          };
        },
      };
      return iterator;
    },
  };
}

export const sseHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
} as const;
