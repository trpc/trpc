import { getTRPCErrorFromUnknown } from '../error/TRPCError';
import type { MaybePromise } from '../types';
import { run } from '../utils';
import type { inferTrackedOutput } from './tracked';
import { isTrackedEnvelope } from './tracked';
import { createDeferred, createTimeoutPromise } from './utils/createDeferred';
import { createReadableStream } from './utils/createReadableStream';

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

export interface SSEStreamProducerOptions {
  serialize?: Serialize;
  data: AsyncIterable<unknown>;
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
export function sseStreamProducer(opts: SSEStreamProducerOptions) {
  const stream = createReadableStream<SSEvent>();
  stream.controller.enqueue({
    comment: 'connected',
  });

  const { serialize = (v) => v } = opts;

  const ping: Required<PingOptions> = {
    enabled: opts.ping?.enabled ?? false,
    intervalMs: opts.ping?.intervalMs ?? 1000,
  };

  run(async () => {
    const iterator = opts.data[Symbol.asyncIterator]();

    const closedPromise = stream.cancelledPromise.then(() => 'closed' as const);
    const maxDurationPromise = createTimeoutPromise(
      opts.maxDurationMs ?? Infinity,
      'maxDuration' as const,
    );

    let nextPromise = iterator.next();

    while (true) {
      const pingPromise = createTimeoutPromise(
        ping.enabled ? ping.intervalMs : Infinity,
        'ping' as const,
      );
      const next = await Promise.race([
        nextPromise.catch(getTRPCErrorFromUnknown),
        pingPromise.promise,
        closedPromise,
        maxDurationPromise.promise,
      ]);

      pingPromise.clear();
      if (next === 'closed') {
        break;
      }
      if (next === 'maxDuration') {
        break;
      }

      if (next === 'ping') {
        stream.controller.enqueue({
          comment: 'ping',
        });
        continue;
      }

      if (next instanceof Error) {
        const data = opts.formatError
          ? opts.formatError({ error: next })
          : null;
        stream.controller.enqueue({
          event: SERIALIZED_ERROR_EVENT,
          data: JSON.stringify(serialize(data)),
        });
        break;
      }
      if (next.done) {
        break;
      }

      const value = next.value;

      const chunk: SSEvent = isTrackedEnvelope(value)
        ? {
            id: value[0],
            data: value[1],
          }
        : {
            data: value,
          };
      if ('data' in chunk) {
        chunk.data = JSON.stringify(serialize(chunk.data));
      }

      stream.controller.enqueue(chunk);

      if (opts.emitAndEndImmediately) {
        // end the stream in the next tick so that we can send a few more events from the queue
        setTimeout(maxDurationPromise.resolve, 1);
      }

      nextPromise = iterator.next();
    }
    maxDurationPromise.clear();
    await iterator.return?.();
    try {
      stream.controller.close();
    } catch {}
  }).catch((error) => {
    return stream.controller.error(error);
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

interface ConsumerStreamResultBase {
  eventSource: EventSource;
}

interface ConsumerStreamResultData<TData> extends ConsumerStreamResultBase {
  type: 'data';
  data: inferTrackedOutput<TData>;
}

interface ConsumerStreamResultError extends ConsumerStreamResultBase {
  type: 'error';
  error: unknown;
}

interface ConsumerStreamResultOpened extends ConsumerStreamResultBase {
  type: 'opened';
}

interface ConsumerStreamResultConnecting extends ConsumerStreamResultBase {
  type: 'connecting';
}

type ConsumerStreamResult<TData> =
  | ConsumerStreamResultData<TData>
  | ConsumerStreamResultError
  | ConsumerStreamResultOpened
  | ConsumerStreamResultConnecting;

export interface SSEStreamConsumerOptions {
  url: () => MaybePromise<string>;
  init: () => MaybePromise<EventSourceInit> | undefined;
  signal: AbortSignal;
  shouldRecreateOnError?: (
    opts:
      | {
          type: 'event';
          event: Event;
        }
      | {
          type: 'serialized-error';
          error: unknown;
        },
  ) => boolean | Promise<boolean>;
  deserialize?: Deserialize;
}
/**
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export function sseStreamConsumer<TData>(
  opts: SSEStreamConsumerOptions,
): AsyncIterable<ConsumerStreamResult<TData>> {
  const { deserialize = (v) => v, shouldRecreateOnError } = opts;

  const signal = opts.signal;

  let eventSource: EventSource | null = null;
  let lock: Promise<void> | null = null;

  const stream = createReadableStream<ConsumerStreamResult<TData>>();

  function createEventSource(
    ...args: ConstructorParameters<typeof EventSource>
  ) {
    const es = new EventSource(...args);

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

    es.addEventListener(SERIALIZED_ERROR_EVENT, (msg) => {
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
            type: 'error',
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
            });
          }
        });
      });
    });
    es.addEventListener('message', (msg) => {
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
          data: def as inferTrackedOutput<TData>,
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
    });
  }

  recreateEventSource().catch(() => {
    // prevent unhandled promise rejection
  });
  return {
    [Symbol.asyncIterator]() {
      const reader = stream.readable.getReader();

      const iterator: AsyncIterator<ConsumerStreamResult<TData>> = {
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
