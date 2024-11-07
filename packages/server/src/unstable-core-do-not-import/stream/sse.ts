import { getTRPCErrorFromUnknown } from '../error/TRPCError';
import type { MaybePromise } from '../types';
import { identity, run } from '../utils';
import type { EventSourceLike } from './sse.types';
import type { inferTrackedOutput } from './tracked';
import { isTrackedEnvelope } from './tracked';
import { takeWithGrace, withCancel } from './utils/asyncIterable';
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
  abortCtrl: AbortController;
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
    type TIteratorValue = Awaited<TValue> | typeof PING_SYM;

    let iterable: AsyncIterable<TValue | typeof PING_SYM> = opts.data;

    iterable = withCancel(iterable, stream.cancelledPromise);

    if (opts.emitAndEndImmediately) {
      iterable = takeWithGrace(iterable, {
        count: 1,
        gracePeriodMs: 1,
        onCancel: () => opts.abortCtrl.abort(),
      });
    }

    let maxDurationTimer: PromiseTimer | null = null;
    if (
      opts.maxDurationMs != null &&
      opts.maxDurationMs > 0 &&
      opts.maxDurationMs !== Infinity
    ) {
      maxDurationTimer = createPromiseTimer(opts.maxDurationMs).start();
      iterable = withCancel(
        iterable,
        maxDurationTimer.promise.then(() => opts.abortCtrl.abort()),
      );
    }

    if (ping.enabled && ping.intervalMs !== Infinity && ping.intervalMs > 0) {
      iterable = withPing(iterable, ping.intervalMs);
    }

    try {
      // We need those declarations outside the loop for garbage collection reasons. If they were
      // declared inside, they would not be freed until the next value is present.
      let value: null | TIteratorValue;
      let chunk: null | SSEvent;

      for await (value of iterable) {
        if (value === PING_SYM) {
          stream.controller.enqueue({ comment: 'ping' });
          continue;
        }

        chunk = isTrackedEnvelope(value)
          ? { id: value[0], data: value[1] }
          : { data: value };
        if ('data' in chunk) {
          chunk.data = JSON.stringify(serialize(chunk.data));
        }

        stream.controller.enqueue(chunk);

        // free up references for garbage collection
        value = null;
        chunk = null;
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
  init: () =>
    | MaybePromise<EventSourceLike.InitDictOf<TConfig['EventSource']>>
    | undefined;
  signal: AbortSignal;
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
  const { deserialize = (v) => v } = opts;

  const signal = opts.signal;

  let _es: InstanceType<TConfig['EventSource']> | null = null;

  const stream = new ReadableStream<ConsumerStreamResult<TConfig>>({
    async start(controller) {
      const [url, init] = await Promise.all([opts.url(), opts.init()]);
      const eventSource = (_es = new opts.EventSource(
        url,
        init,
      ) as InstanceType<TConfig['EventSource']>);

      controller.enqueue({
        type: 'connecting',
        eventSource: _es,
        event: null,
      });
      eventSource.addEventListener('open', () => {
        controller.enqueue({
          type: 'opened',
          eventSource,
        });
      });

      eventSource.addEventListener(SERIALIZED_ERROR_EVENT, (_msg) => {
        const msg = _msg as EventSourceLike.MessageEvent;

        controller.enqueue({
          type: 'serialized-error',
          error: deserialize(JSON.parse(msg.data)),
          eventSource,
        });
      });
      eventSource.addEventListener('error', (event) => {
        if (eventSource.readyState === EventSource.CLOSED) {
          controller.error(event);
        } else {
          controller.enqueue({
            type: 'connecting',
            eventSource,
            event,
          });
        }
      });
      eventSource.addEventListener('message', (_msg) => {
        const msg = _msg as EventSourceLike.MessageEvent;

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
          eventSource,
        });
      });

      const onAbort = () => {
        controller.close();
        eventSource.close();
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort);
      }
    },
    cancel() {
      _es?.close();
    },
  });
  return {
    [Symbol.asyncIterator]() {
      const reader = stream.getReader();

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
