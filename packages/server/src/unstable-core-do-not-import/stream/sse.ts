import { getTRPCErrorFromUnknown } from '../error/TRPCError';
import { run } from '../utils';
import type { ConsumerOnError } from './jsonl';
import type { inferTrackedOutput } from './tracked';
import { isTrackedEnvelope } from './tracked';
import { createTimeoutPromise } from './utils/createDeferred';
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
  /**
   *
   * @param opts
   * @returns
   */
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

const serializedErrorSymbol = Symbol(SERIALIZED_ERROR_EVENT);
type SerializedErrorEnvelope = [unknown, typeof serializedErrorSymbol];
export function isSerializedSSEError(v: unknown): v is SerializedErrorEnvelope {
  return Array.isArray(v) && v[1] === serializedErrorSymbol;
}

type ConsumerIterableValue<TData> =
  | inferTrackedOutput<TData>
  | SerializedErrorEnvelope;
/**
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export function sseStreamConsumer<TData>(opts: {
  from: EventSource;
  onError?: ConsumerOnError;
  deserialize?: Deserialize;
}): AsyncIterable<ConsumerIterableValue<TData>> {
  const { deserialize = (v) => v } = opts;
  const eventSource = opts.from;

  const stream = createReadableStream<MessageEvent>();

  const transform = new TransformStream<
    MessageEvent,
    ConsumerIterableValue<TData>
  >({
    async transform(chunk, controller) {
      // console.debug('transforming', chunk.type, chunk.data);
      const def: SSEvent = {
        data: deserialize(JSON.parse(chunk.data)),
      };

      if (chunk.lastEventId) {
        def.id = chunk.lastEventId;
      }

      if (chunk.type === SERIALIZED_ERROR_EVENT) {
        const err: SerializedErrorEnvelope = [
          deserialize(JSON.parse(chunk.data)),
          serializedErrorSymbol,
        ];
        controller.enqueue(err);
        return;
      }
      controller.enqueue(def as inferTrackedOutput<TData>);
    },
  });

  eventSource.addEventListener('message', (msg) => {
    stream.controller.enqueue(msg);
  });
  eventSource.addEventListener(SERIALIZED_ERROR_EVENT, (msg) => {
    stream.controller.enqueue(msg);
  });
  eventSource.addEventListener('error', (cause) => {
    if (eventSource.readyState === EventSource.CLOSED) {
      stream.controller.error(cause);
    }
  });

  const readable = stream.readable.pipeThrough(transform);
  return {
    [Symbol.asyncIterator]() {
      const reader = readable.getReader();

      const iterator: AsyncIterator<ConsumerIterableValue<TData>> = {
        async next() {
          const value = await reader.read();
          if (value.done) {
            return {
              value: value.value,
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
