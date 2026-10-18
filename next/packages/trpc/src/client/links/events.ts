import { type Cause, Effect, Fiber, Queue, Stream } from 'effect';
import { fromWireError } from '../../internal/error.ts';
import {
  failure,
  Reason,
  streamErrors,
  type Failure,
  type ReasonOf,
} from '../../internal/failure.ts';
import type {
  Frame,
  SerializeOpts,
  SerializeReturn,
  AnySerializer,
} from '../../serializer/index.ts';

/**
 * Serializes a call's input; a value the serializer can't send fails the call
 * as a `BAD_REQUEST` before anything is sent.
 * @internal
 */
export function serializeInput(
  serializer: AnySerializer,
  input: unknown,
  opts?: SerializeOpts,
): SerializeReturn {
  try {
    return serializer.serialize(input, opts);
  } catch (cause) {
    throw failure(Reason.UnserializableInput(), cause);
  }
}

/** A part of a response the client couldn't decode. @internal */
export const undecodable =
  (part: ReasonOf<'UndecodableResponse'>['part']) =>
  (cause?: unknown): Failure =>
    failure(Reason.UndecodableResponse({ part }), cause);

type FrameQueue = Queue.Queue<Frame, Cause.Done>;

/**
 * Rebuilds values whose deferred parts arrive as later chunks: subscription
 * events (numbered per call) or a single result. Run its effects in message
 * order.
 * @internal
 */
export interface DeferredDecoder {
  /**
   * Starts decoding a value and returns an effect that waits for its head;
   * deferred parts settle later. The head itself can wait on later chunks
   * (a file's bytes), so keep feeding chunks while it decodes.
   */
  readonly decode: (
    body: unknown,
    deferred: number | undefined,
  ) => Effect.Effect<Effect.Effect<unknown, unknown>>;
  readonly chunk: (deferred: number, chunk: unknown) => Effect.Effect<void>;
  readonly end: (deferred: number) => Effect.Effect<void>;
  /** Ends every pending value: their unsettled parts reject. */
  readonly close: Effect.Effect<void>;
}

/** @internal */
export function makeDeferredDecoder(
  serializer: AnySerializer,
): DeferredDecoder {
  const queues = new Map<number, FrameQueue>();
  return {
    decode: (body, deferred) =>
      deferred === undefined
        ? Effect.sync(() =>
            Effect.try({
              try: () => serializer.deserialize(body as never),
              catch: (cause) => cause,
            }),
          )
        : Effect.gen(function* () {
            const queue = yield* Queue.unbounded<Frame, Cause.Done>();
            queues.set(deferred, queue);
            yield* Queue.offer(queue, body as Frame);
            const head = yield* serializer
              .deserializeStream(Stream.fromQueue(queue), {
                reviveError: (value) => fromWireError(value),
                ...streamErrors,
              })
              .pipe(Effect.forkDetach);
            return Fiber.join(head);
          }),
    chunk: (deferred, chunk) =>
      Effect.suspend(() => {
        const queue = queues.get(deferred);
        return queue
          ? Effect.asVoid(Queue.offer(queue, chunk as Frame))
          : Effect.void;
      }),
    end: (deferred) =>
      Effect.sync(() => {
        const queue = queues.get(deferred);
        if (!queue) return;
        queues.delete(deferred);
        Queue.endUnsafe(queue);
      }),
    close: Effect.sync(() => {
      for (const queue of queues.values()) Queue.endUnsafe(queue);
      queues.clear();
    }),
  };
}
