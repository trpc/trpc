import { getTRPCErrorFromUnknown } from '../error/TRPCError';
import type { ValidateShape } from '../types';
import { run } from '../utils';
import type { ConsumerOnError } from './jsonl';
import { createTimeoutPromise } from './utils/createDeferred';
import { createReadableStream } from './utils/createReadableStream';

type Serialize = (value: any) => any;
type Deserialize = (value: any) => any;

interface SSEventWithId {
  /**
   * The data field of the message - this can be anything
   */
  data: unknown;
  /**
   * The id for this message
   * Passing this id will allow the client to resume the connection from this point if the connection is lost
   * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#the-last-event-id-header
   */
  id: string;
  /**
   * Event name for the message
   */
  event?: string;
  /**
   * A comment for the event
   */
  comment?: string;
}

/**
 * Server-sent Event
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 * @public
 */
export type SSEvent = Partial<SSEventWithId>;

const sseSymbol = Symbol('SSEventEnvelope');
export type ServerSentEventEnvelope<TData> = [typeof sseSymbol, TData];

/**
 * Produce a typed server-sent event
 */
export function sse<TData extends SSEvent>(
  event: ValidateShape<TData, SSEvent>,
): ServerSentEventEnvelope<TData> {
  return [sseSymbol, event as TData];
}

export function isServerSentEventEnvelope<TData extends SSEvent>(
  value: unknown,
): value is ServerSentEventEnvelope<TData> {
  return Array.isArray(value) && value[0] === sseSymbol;
}

export type SerializedSSEvent = Omit<SSEvent, 'data'> & {
  data?: string;
};

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
}
/**
 *
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export function sseStreamProducer(opts: SSEStreamProducerOptions) {
  const stream = createReadableStream<SerializedSSEvent>();
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
        stream.controller.error(next);
        break;
      }
      if (next.done) {
        break;
      }

      const value = next.value;

      const data: SSEvent = isServerSentEventEnvelope(value)
        ? value[1]
        : {
            data: value,
          };
      const chunk: SerializedSSEvent = {};
      Object.assign(chunk, data);
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
    new TransformStream<SerializedSSEvent, string>({
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
        controller.enqueue('\n\n');
      },
    }),
  );
}
export type inferSSEOutput<TData> = TData extends ServerSentEventEnvelope<
  infer $Data
>
  ? $Data
  : TData;
/**
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */

export function sseStreamConsumer<TData>(opts: {
  from: EventSource;
  onError?: ConsumerOnError;
  deserialize?: Deserialize;
}): AsyncIterable<inferSSEOutput<TData>> {
  const { deserialize = (v) => v } = opts;
  const eventSource = opts.from;

  const stream = createReadableStream<SerializedSSEvent>();

  const transform = new TransformStream<
    SerializedSSEvent,
    inferSSEOutput<TData>
  >({
    async transform(chunk, controller) {
      if (chunk.data) {
        const def: SSEvent = {};
        def.data = deserialize(JSON.parse(chunk.data));
        if ('id' in chunk) {
          def.id = chunk.id;
        }
        if ('event' in chunk) {
          def.event = chunk.event;
        }

        controller.enqueue(def as inferSSEOutput<TData>);
      }
    },
  });

  eventSource.addEventListener('message', (msg) => {
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

      const iterator: AsyncIterator<inferSSEOutput<TData>> = {
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
