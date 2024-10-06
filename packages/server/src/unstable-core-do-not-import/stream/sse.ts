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

type ConsumerStreamResult<TData> =
  | {
      type: 'data';
      data: inferTrackedOutput<TData>;
    }
  | {
      type: 'error';
      error: unknown;
    }
  | {
      type: 'opened';
    };

type RecreateOnErrorOpt =
  | {
      type: 'event';
      event: Event;
    }
  | {
      type: 'serialized-error';
      error: unknown;
    };

const raceSignals = (...signals: AbortSignal[]) => {
  const controller = new AbortController();

  for (const signal of signals) {
    signal.addEventListener('abort', () => controller.abort(), {
      once: true,
    });
  }
  return controller.signal;
};
/**
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export function sseStreamConsumer<TData>(opts: {
  url: () => MaybePromise<string>;
  init: () => MaybePromise<EventSourceInit> | undefined;
  signal: AbortSignal;
  /**
   * For a given error, should we reinitialize the underlying EventSource?
   *
   * This is useful where a long running subscription might be interrupted by a recoverable network error,
   * but the existing authorization in a header or URI has expired in the mean-time
   */
  shouldRecreateOnError?: (
    opt: RecreateOnErrorOpt,
  ) => boolean | Promise<boolean>;
  deserialize?: Deserialize;
}): AsyncIterable<ConsumerStreamResult<TData>> {
  const { deserialize = (v) => v } = opts;
  let lock: Promise<void> = Promise.resolve();
  let eventSource: EventSource | null = null;
  const ac = new AbortController();
  const signal = raceSignals(ac.signal, opts.signal);
  const readable = new ReadableStream<ConsumerStreamResult<TData>>({
    async start(controller) {
      console.log('start');
      const initEventSource = async () => {
        const es = new EventSource(await opts.url(), await opts.init());
        console.log('initEventSource', es);

        if (signal.aborted) {
          es.close();
        } else {
          signal.addEventListener('abort', () => es.close());
        }

        const handleIfNotReplaced = (fn: () => void | Promise<void>) => {
          run(async () => {
            await lock;
            if (es === eventSource) {
              await fn();
            }
          }).catch((error) => {
            controller.error(error);
          });
        };

        es.addEventListener('open', () => {
          console.log('open');
          handleIfNotReplaced(() => {
            controller.enqueue({
              type: 'opened',
            });
          });
        });
        es.addEventListener(SERIALIZED_ERROR_EVENT, (msg) => {
          handleIfNotReplaced(async () => {
            if (opts.shouldRecreateOnError) {
              const deferred = createDeferred<void>();
              lock = deferred.promise;
              const recreate = await opts.shouldRecreateOnError({
                type: SERIALIZED_ERROR_EVENT,
                error: deserialize(JSON.parse(msg.data)),
              });
              if (recreate) {
                es.close();
                eventSource = await initEventSource();
              }
              deferred.resolve();
            }
            controller.enqueue({
              type: 'error',
              error: deserialize(JSON.parse(msg.data)),
            });
          });
        });
        es.addEventListener('error', (event) => {
          handleIfNotReplaced(async () => {
            if (opts.shouldRecreateOnError) {
              const recreate = await opts.shouldRecreateOnError({
                type: 'event',
                event,
              });
              if (recreate) {
                es.close();
                eventSource = await initEventSource();
                return;
              }
            }

            if (es.readyState === EventSource.CLOSED) {
              controller.error(event);
            }
          });
        });
        es.addEventListener('message', (msg) => {
          handleIfNotReplaced(() => {
            const chunk = deserialize(JSON.parse(msg.data));
            console.log('message', chunk);

            const def: SSEvent = {
              data: chunk.data,
            };
            if (chunk.id) {
              def.id = chunk.id;
            }
            controller.enqueue({
              type: 'data',
              data: def as inferTrackedOutput<TData>,
            });
          });
        });
        return es;
      };

      eventSource = await initEventSource();
    },
    cancel() {
      ac.abort();
    },
  });

  return {
    [Symbol.asyncIterator]() {
      const reader = readable.getReader();

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
