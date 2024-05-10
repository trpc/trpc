import { getTRPCErrorFromUnknown } from '../error/TRPCError';
import type { TypeError } from '../types';
import { isObject, run } from '../utils';
import type { ConsumerOnError } from './jsonl';
import { createDeferred } from './utils/createDeferred';

type Serialize = (value: any) => any;
type Deserialize = (value: any) => any;

export type SSEChunk = {
  data?: unknown;
  id?: string | number;
  event?: string;
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
  const responseStream = new TransformStream<SerializedSSEChunk, string>({
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
  });
  const writer = responseStream.writable.getWriter();

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
    const closedPromise = writer.closed.then(() => 'closed' as const);

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
        await writer.write({
          data: '',
          event: 'ping',
        });
        continue;
      }

      if (next instanceof Error) {
        await writer.abort(next);
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

      //
      await writer.write(chunk);
      nextPromise = iterator.next();
    }
  }).catch((error) => {
    return writer.abort(error);
  });

  return responseStream.readable;
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
