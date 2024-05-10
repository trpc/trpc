import type { TypeError } from '../types';
import type {
  ConsumerOnError,
  Deserialize,
  SerializedSSEChunk,
  SSEChunk,
} from './jsonl';

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
