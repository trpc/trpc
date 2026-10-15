import { Cause, Effect, Queue, Stream } from 'effect';
import { fromWireError, TrpcError } from '../../internal/error.ts';
import type {
  Frame,
  SerializeOpts,
  SerializeReturn,
  Serializer,
} from '../../serializer/index.ts';

/**
 * Serializes a call's input; a value the serializer can't send fails the call
 * as a `BAD_REQUEST` before anything is sent.
 * @internal
 */
export function serializeInput(
  serializer: Serializer,
  input: unknown,
  opts?: SerializeOpts,
): SerializeReturn {
  try {
    return serializer.serialize(input, opts);
  } catch (cause) {
    throw new TrpcError({
      code: 'BAD_REQUEST',
      message: cause instanceof Error ? cause.message : 'Invalid input',
      cause,
    });
  }
}

type FrameQueue = Queue.Queue<Frame, Cause.Done>;

/**
 * Rebuilds values whose deferred parts arrive as later chunks: subscription
 * events (numbered per call) or a single result.
 * @internal
 */
export class DeferredDecoder {
  #serializer: Serializer;
  #queues = new Map<number, FrameQueue>();

  constructor(serializer: Serializer) {
    this.#serializer = serializer;
  }

  /** The value, once its head is decoded. Its deferred parts settle later. */
  decode(body: unknown, deferred: number | undefined): Promise<unknown> {
    if (deferred === undefined) {
      try {
        return Promise.resolve(this.#serializer.deserialize(body as never));
      } catch (cause) {
        return Promise.reject(cause);
      }
    }
    const queue = Effect.runSync(Queue.unbounded<Frame, Cause.Done>());
    this.#queues.set(deferred, queue);
    Queue.offerUnsafe(queue, body as Frame);
    return Effect.runPromise(
      this.#serializer.deserializeStream(Stream.fromQueue(queue), {
        reviveError: (value) => fromWireError(value),
      }),
    );
  }

  chunk(deferred: number, chunk: unknown): void {
    const queue = this.#queues.get(deferred);
    if (queue) Queue.offerUnsafe(queue, chunk as Frame);
  }

  end(deferred: number): void {
    const queue = this.#queues.get(deferred);
    if (!queue) return;
    this.#queues.delete(deferred);
    Queue.endUnsafe(queue);
  }

  /** Ends every pending value: their unsettled parts reject. */
  close(): void {
    for (const queue of this.#queues.values()) Queue.endUnsafe(queue);
    this.#queues.clear();
  }
}
