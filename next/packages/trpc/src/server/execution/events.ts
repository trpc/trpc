import { Effect, FiberSet, Stream } from 'effect';
import { isTrpcError, type AnyTrpcError } from '../../internal/error.ts';
import type { AnyTransformer } from '../../transformer/index.ts';
import type { Chunk } from '../../transformer/danson/index.ts';
import { unexpectedError } from './execute.ts';
import { isTracked } from '../subscriptions/index.ts';

/** @internal */
export type EventFrame =
  | {
      kind: 'event';
      body: unknown;
      eventId: string | undefined;
      /** Set when chunks follow: the event's number among deferred events. */
      deferred: number | undefined;
    }
  | { kind: 'chunk'; event: number; chunk: Chunk }
  | { kind: 'chunkEnd'; event: number };

/**
 * Serializes subscription events in order. Chunks of an event's deferred
 * values are sent as they settle, interleaved with later events, each
 * event's on a fiber in a `FiberSet`, which drops it once its chunks are
 * sent. Completes once the events and every chunk are sent.
 * @internal
 */
export const emitEvents: (
  events: Stream.Stream<unknown, AnyTrpcError>,
  serializer: AnyTransformer,
  coerceError: (cause: unknown) => unknown,
  emit: (frame: EventFrame) => Effect.Effect<void>,
) => Effect.Effect<void, AnyTrpcError> = /* @__PURE__ */ Effect.fnUntraced(
  function* (
    events: Stream.Stream<unknown, AnyTrpcError>,
    serializer: AnyTransformer,
    coerceError: (cause: unknown) => unknown,
    emit: (frame: EventFrame) => Effect.Effect<void>,
  ) {
    let deferredCount = 0;
    const chunkFibers = yield* FiberSet.make<void>();
    yield* Stream.runForEach(
      events,
      Effect.fnUntraced(function* (event) {
        const serialized = yield* Effect.try({
          try: () => serializer.serializeDeferred(event, { coerceError }),
          catch: (cause) =>
            isTrpcError(cause) ? cause : unexpectedError(cause),
        });
        const eventId = isTracked(event) ? event.id : undefined;
        if (!serialized.chunks) {
          return yield* emit({
            kind: 'event',
            body: serialized.head,
            eventId,
            deferred: undefined,
          });
        }
        const n = deferredCount++;
        yield* emit({
          kind: 'event',
          body: serialized.head,
          eventId,
          deferred: n,
        });
        yield* FiberSet.run(
          chunkFibers,
          Stream.runForEach(serialized.chunks, (chunk) =>
            emit({ kind: 'chunk', event: n, chunk }),
          ).pipe(
            Effect.ignore,
            // Not `ensuring`: `emit` may wait on a slow reader, and a finalizer
            // can't be interrupted, so a reader that left would hang it.
            Effect.andThen(emit({ kind: 'chunkEnd', event: n })),
          ),
        );
      }),
    );
    yield* FiberSet.awaitEmpty(chunkFibers);
  },
  Effect.scoped,
);
