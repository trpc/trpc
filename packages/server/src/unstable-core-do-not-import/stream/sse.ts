import { Unpromise } from '../../vendor/unpromise';
import { getTRPCErrorFromUnknown } from '../error/TRPCError';
import { isAbortError } from '../http/isAbortError';
import type { MaybePromise } from '../types';
import { identity, run } from '../utils';
import type { EventSourceLike } from './sse.types';
import type { inferTrackedOutput } from './tracked';
import { isTrackedEnvelope } from './tracked';
import { takeWithGrace, withMaxDuration } from './utils/asyncIterable';
import { createReadableStream } from './utils/createReadableStream';
import { PING_SYM, withPing } from './utils/withPing';

type Serialize = (value: any) => any;
type Deserialize = (value: any) => any;

/**
 * @internal
 */
export interface SSEPingOptions {
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

export interface SSEClientOptions {
  /**
   * Timeout and reconnect after inactivity in milliseconds
   * @default undefined
   */
  reconnectAfterInactivityMs?: number;
}

export interface SSEStreamProducerOptions<TValue = unknown> {
  serialize?: Serialize;
  data: AsyncIterable<TValue>;

  maxDepth?: number;
  ping?: SSEPingOptions;
  /**
   * Maximum duration in milliseconds for the request before ending the stream
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
  /**
   * Client-specific options - these will be sent to the client as part of the first message
   * @default {}
   */
  client?: SSEClientOptions;
}

const PING_EVENT = 'ping';
const SERIALIZED_ERROR_EVENT = 'serialized-error';
const CONNECTED_EVENT = 'connected';

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

  const { serialize = identity } = opts;

  const ping: Required<SSEPingOptions> = {
    enabled: opts.ping?.enabled ?? false,
    intervalMs: opts.ping?.intervalMs ?? 1000,
  };
  const client: SSEClientOptions = opts.client ?? {};

  stream.controller.enqueue({
    event: CONNECTED_EVENT,
    data: JSON.stringify(client),
  });
  if (
    ping.enabled &&
    client.reconnectAfterInactivityMs &&
    ping.intervalMs > client.reconnectAfterInactivityMs
  ) {
    throw new Error(
      `Ping interval must be less than client reconnect interval to prevent unnecessary reconnection - ping.intervalMs: ${ping.intervalMs} client.reconnectAfterInactivityMs: ${client.reconnectAfterInactivityMs}`,
    );
  }

  run(async () => {
    type TIteratorValue = Awaited<TValue> | typeof PING_SYM;

    let iterable: AsyncIterable<TValue | typeof PING_SYM> = opts.data;

    if (opts.emitAndEndImmediately) {
      iterable = takeWithGrace(iterable, {
        count: 1,
        gracePeriodMs: 1,
      });
    }

    if (
      opts.maxDurationMs &&
      opts.maxDurationMs > 0 &&
      opts.maxDurationMs !== Infinity
    ) {
      iterable = withMaxDuration(iterable, {
        maxDurationMs: opts.maxDurationMs,
      });
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
          stream.controller.enqueue({ event: PING_EVENT, data: '' });
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
      if (isAbortError(err)) {
        // ignore abort errors, send any other errors
        return;
      }
      // `err` must be caused by `opts.data`, `JSON.stringify` or `serialize`.
      // So, a user error in any case.
      const error = getTRPCErrorFromUnknown(err);
      const data = opts.formatError?.({ error }) ?? null;
      stream.controller.enqueue({
        event: SERIALIZED_ERROR_EVENT,
        data: JSON.stringify(serialize(data)),
      });
    } finally {
      try {
        stream.controller.close();
      } catch {
        // ignore
      }
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

interface ConsumerStreamResultConnecting<TConfig extends ConsumerConfig>
  extends ConsumerStreamResultBase<TConfig> {
  type: 'connecting';
  event: EventSourceLike.EventOf<TConfig['EventSource']> | null;
}
interface ConsumerStreamResultTimeout<TConfig extends ConsumerConfig>
  extends ConsumerStreamResultBase<TConfig> {
  type: 'timeout';
  ms: number;
}
interface ConsumerStreamResultPing<TConfig extends ConsumerConfig>
  extends ConsumerStreamResultBase<TConfig> {
  type: 'ping';
}

interface ConsumerStreamResultConnected<TConfig extends ConsumerConfig>
  extends ConsumerStreamResultBase<TConfig> {
  type: 'connected';
  options: SSEClientOptions;
}

type ConsumerStreamResult<TConfig extends ConsumerConfig> =
  | ConsumerStreamResultData<TConfig>
  | ConsumerStreamResultError<TConfig>
  | ConsumerStreamResultConnecting<TConfig>
  | ConsumerStreamResultTimeout<TConfig>
  | ConsumerStreamResultPing<TConfig>
  | ConsumerStreamResultConnected<TConfig>;

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

async function withTimeout<T>(opts: {
  promise: Promise<T>;
  timeoutMs: number;
  onTimeout: () => Promise<NoInfer<T>>;
}): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(null);
    }, opts.timeoutMs);
  });
  let res;
  try {
    res = await Unpromise.race([opts.promise, timeoutPromise]);
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    clearTimeout(timeoutId!);
  }
  if (res === null) {
    return await opts.onTimeout();
  }
  return res;
}

/**
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export function sseStreamConsumer<TConfig extends ConsumerConfig>(
  opts: SSEStreamConsumerOptions<TConfig>,
): AsyncIterable<ConsumerStreamResult<TConfig>> {
  const { deserialize = (v) => v } = opts;

  let clientOptions: SSEClientOptions = {};

  const signal = opts.signal;

  let _es: InstanceType<TConfig['EventSource']> | null = null;

  const createStream = () =>
    new ReadableStream<ConsumerStreamResult<TConfig>>({
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

        eventSource.addEventListener(CONNECTED_EVENT, (_msg) => {
          const msg = _msg as EventSourceLike.MessageEvent;
          const options: SSEClientOptions = JSON.parse(msg.data);

          clientOptions = options;
          controller.enqueue({
            type: 'connected',
            options,
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
        eventSource.addEventListener(PING_EVENT, () => {
          controller.enqueue({
            type: 'ping',
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

  const getNewStreamAndReader = () => {
    const stream = createStream();
    const reader = stream.getReader();

    return {
      reader,
      cancel: () => {
        reader.releaseLock();
        return stream.cancel();
      },
    };
  };
  return {
    [Symbol.asyncIterator]() {
      let stream = getNewStreamAndReader();

      const iterator: AsyncIterator<ConsumerStreamResult<TConfig>> = {
        async next() {
          let promise = stream.reader.read();

          const timeoutMs = clientOptions.reconnectAfterInactivityMs;
          if (timeoutMs) {
            promise = withTimeout({
              promise,
              timeoutMs,
              onTimeout: async () => {
                // Close and release old reader
                await stream.cancel();

                // Create new reader
                stream = getNewStreamAndReader();

                return {
                  value: {
                    type: 'timeout',
                    ms: timeoutMs,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    eventSource: _es!,
                  },
                  done: false,
                };
              },
            });
          }

          const result = await promise;

          // console.debug('result', result, 'done', result.done);
          if (result.done) {
            return {
              value: result.value,
              done: true,
            };
          }
          return {
            value: result.value,
            done: false,
          };
        },
        async return() {
          await stream.cancel();
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
