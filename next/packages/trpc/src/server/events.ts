import { Effect, Fiber, Stream } from 'effect';
import { isTrpcError, type AnyTrpcError } from '../internal/error.ts';
import type { AnySerializer } from '../serializer/index.ts';
import type { Chunk } from '../serializer/stream.ts';
import { unexpectedError } from './execute.ts';
import { isTracked } from './tracked.ts';

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
 * values are sent as they settle, interleaved with later events. Completes
 * once the events and every chunk are sent.
 * @internal
 */
export function emitEvents(
  events: Stream.Stream<unknown, AnyTrpcError>,
  serializer: AnySerializer,
  coerceError: (cause: unknown) => unknown,
  emit: (frame: EventFrame) => void,
): Effect.Effect<void, AnyTrpcError> {
  return Effect.scoped(
    Effect.gen(function* () {
      let deferredCount = 0;
      const fibers: Fiber.Fiber<void>[] = [];
      yield* Stream.runForEach(events, (event) =>
        Effect.gen(function* () {
          const serialized = yield* Effect.try({
            try: () => serializer.serializeDeferred(event, { coerceError }),
            catch: (cause) =>
              isTrpcError(cause) ? cause : unexpectedError(cause),
          });
          const eventId = isTracked(event) ? event.id : undefined;
          if (!serialized.chunks) {
            emit({
              kind: 'event',
              body: serialized.head,
              eventId,
              deferred: undefined,
            });
            return;
          }
          const n = deferredCount++;
          emit({ kind: 'event', body: serialized.head, eventId, deferred: n });
          const fiber = yield* Stream.runForEach(serialized.chunks, (chunk) =>
            Effect.sync(() => emit({ kind: 'chunk', event: n, chunk })),
          ).pipe(
            Effect.ignore,
            Effect.ensuring(
              Effect.sync(() => emit({ kind: 'chunkEnd', event: n })),
            ),
            Effect.forkScoped,
          );
          fibers.push(fiber);
        }),
      );
      yield* Fiber.joinAll(fibers);
    }),
  );
}
