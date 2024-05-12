import { getTRPCErrorFromUnknown } from '../error/TRPCError';
import type { TypeError } from '../types';
import { isObject, run } from '../utils';
import type { ConsumerOnError } from './jsonl';
import { createDeferred } from './utils/createDeferred';
import { createReadableStream } from './utils/createReadableStream';

type Serialize = (value: any) => any;
type Deserialize = (value: any) => any;

/**
 * Server-Sent Events chunk
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export type SSEChunk = {
  data?: unknown;
  id?: string | number;
  /**
   * Event name for the message
   */
  event?: string;
  comment?: string;
};

export type SerializedSSEChunk = Omit<SSEChunk, 'data'> & {
  data?: string;
};

/**
 *
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export function sseStreamProducer(opts: {
  serialize?: Serialize;
  data: AsyncIterable<unknown>;

  maxDepth?: number;
}) {
  const stream = createReadableStream<SerializedSSEChunk>();
  stream.controller.enqueue({
    comment: 'connected',
  });

  const { serialize = (v) => v } = opts;

  run(async () => {
    const iterator = opts.data[Symbol.asyncIterator]();

    const pingPromise = () => {
      let deferred = createDeferred<'ping'>();
      deferred = deferred as typeof deferred & { clear: () => void };

      const timeout = setTimeout(() => {
        deferred.resolve('ping');
      }, 1000);

      return {
        promise: deferred.promise,
        clear: () => {
          clearTimeout(timeout);
        },
      };
    };
    const closedPromise = stream.cancelledPromise.then(() => 'closed' as const);

    let nextPromise = iterator.next();
    while (true) {
      const ping = pingPromise();
      const next = await Promise.race([
        nextPromise.catch(getTRPCErrorFromUnknown),
        ping.promise,
        closedPromise,
      ]);
      ping.clear();
      if (next === 'closed') {
        await iterator.return?.();
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

      if (!isObject(value)) {
        await iterator.throw?.(new TypeError(`Expected a SerializedSSEChunk`));
        return;
      }
      const chunk: SerializedSSEChunk = {};
      if (typeof value['id'] === 'string' || typeof value['id'] === 'number') {
        chunk.id = value['id'];
      }
      if (typeof value['event'] === 'string') {
        chunk.event = value['event'];
      }
      if ('data' in value) {
        chunk.data = JSON.stringify(serialize(value['data']));
      }

      stream.controller.enqueue(chunk);
      nextPromise = iterator.next();
    }
    await iterator.return?.();
  }).catch((error) => {
    return stream.controller.error(error);
  });

  return stream.readable.pipeThrough(
    new TransformStream<SerializedSSEChunk, string>({
      transform(chunk, controller) {
        // console.log('adding', { chunk });
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
type inferSSEOutput<TData> = TData extends SSEChunk
  ? TData
  : TypeError<'Expected a SSEChunk - use `satisfies SSEChunk'>;
/**
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */

export function sseStreamConsumer<TData>(opts: {
  from: EventSource;
  onError?: ConsumerOnError;
  deserialize?: Deserialize;
}): AsyncIterable<inferSSEOutput<TData>> {
  const { deserialize = (v) => v } = opts;

  const response = new TransformStream<
    SerializedSSEChunk,
    inferSSEOutput<TData>
  >({
    async transform(chunk, controller) {
      if (chunk.data) {
        const def: SSEChunk = {};
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
  const writer = response.writable.getWriter();

  opts.from.addEventListener('message', (msg) => {
    writer
      .write({
        data: msg.data,
      })
      .catch((error) => {
        opts.onError?.({ error });
      });
  });
  opts.from.addEventListener('error', (cause) => {
    if ('status' in cause && cause.status !== 200) {
      writer.abort(new Error('EventSource error', { cause })).catch(() => {
        // noop
      });
    }
  });
  return {
    [Symbol.asyncIterator]() {
      const reader = response.readable.getReader();

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
  'Cache-Control': 'no-cache',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
  'Transfer-Encoding': 'chunked',
} as const;
