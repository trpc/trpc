import { Effect, Option, Queue, Stream } from 'effect';
import {
  fromWireError,
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../../../internal/error.ts';
import {
  CONTENT_TYPE,
  HEADER,
  SSE_EVENT,
  sseEvents,
  type SseEvent,
} from '../../../internal/protocol.ts';
import type { Operation, OperationStream } from '../../link.ts';
import {
  badResponse,
  makeDeferredDecoder,
  type DeferredDecoder,
} from '../events.ts';
import type { HttpLinkOptions } from './link.ts';
import { bodyStream, ok, type Transport } from './transport.ts';

/**
 * Subscriptions over SSE: one connection at a time, reconnecting with
 * `Last-Event-ID` after a dropped one until `reconnect.attempts` in a row
 * fail.
 */
export function makeSubscriptions(
  transport: Transport,
  opts: HttpLinkOptions,
): (op: Operation) => OperationStream {
  const reconnectAttempts = opts.reconnect?.attempts ?? 5;
  const reconnectDelay =
    opts.reconnect?.delayMs ??
    ((attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 30_000));

  return (op) =>
    Stream.callback<Effect.Effect<unknown, AnyTrpcError>, AnyTrpcError>(
      (queue) => {
        let lastEventId = op.lastEventId;
        let attempt = 0;
        const giveUp = () =>
          op.context.reconnect === false || ++attempt > reconnectAttempts;

        const read = (
          event: SseEvent,
          decoder: DeferredDecoder,
        ): Effect.Effect<boolean, unknown> => {
          switch (event.event) {
            case SSE_EVENT.done:
              return Effect.succeed(true);
            case SSE_EVENT.error:
              return Effect.try({
                try: () =>
                  fromWireError(
                    transport.serializer.deserialize(JSON.parse(event.data)),
                  ),
                catch: (cause) => cause,
              }).pipe(Effect.flatMap(Effect.fail));
            case SSE_EVENT.chunk:
              return Effect.try({
                try: () =>
                  JSON.parse(event.data) as { e: number; chunk?: unknown },
                catch: (cause) => cause,
              }).pipe(
                Effect.flatMap((frame) =>
                  'chunk' in frame
                    ? decoder.chunk(frame.e, frame.chunk)
                    : decoder.end(frame.e),
                ),
                Effect.as(false),
              );
            case SSE_EVENT.message:
            case SSE_EVENT.deferred: {
              if (event.id !== undefined) lastEventId = event.id;
              attempt = 0;
              return Effect.try({
                try: () => JSON.parse(event.data) as unknown,
                catch: (cause) => cause,
              }).pipe(
                Effect.flatMap((data) =>
                  event.event === SSE_EVENT.deferred
                    ? decoder.decode(
                        (data as { body: unknown }).body,
                        (data as { e: number }).e,
                      )
                    : decoder.decode(data, undefined),
                ),
                Effect.map((value) => {
                  Queue.offerUnsafe(
                    queue,
                    Effect.mapError(value, badResponse('Invalid event')),
                  );
                  return false;
                }),
              );
            }
            default:
              return Effect.succeed(false);
          }
        };

        /**
         * One connection, after the delay a reconnect waits; `true` once the
         * server ended the subscription. Its scope aborts the request.
         */
        const connect = Effect.gen(function* () {
          if (attempt > 0) yield* Effect.sleep(reconnectDelay(attempt));
          const reply = yield* transport
            .call(
              op,
              CONTENT_TYPE.sse,
              lastEventId ? { [HEADER.lastEventId]: lastEventId } : {},
            )
            .pipe(
              Effect.catch((error) =>
                giveUp() ? Effect.fail(error) : Effect.succeed(null),
              ),
            );
          if (!reply) return false;
          yield* transport.reported(op, reply);
          if (!ok(reply) || reply.web.body === null) {
            return yield* transport.readError(reply);
          }
          const decoder = makeDeferredDecoder(transport.serializer);
          const ended = yield* sseEvents(bodyStream(reply)).pipe(
            Stream.mapEffect((event) => read(event, decoder)),
            Stream.takeUntil((done) => done),
            Stream.runLast,
            Effect.map((last) => Option.getOrElse(last, () => false)),
            // Anything but a server error reconnects.
            Effect.catch((cause) =>
              isTrpcError(cause) ? Effect.fail(cause) : Effect.succeed(false),
            ),
            Effect.ensuring(decoder.close),
          );
          if (ended) return true;
          if (giveUp()) {
            return yield* Effect.fail(
              new TrpcError({
                code: 'NETWORK_ERROR',
                message: 'The subscription connection was lost',
              }),
            );
          }
          return false;
        }).pipe(Effect.scoped);

        return Effect.repeat(connect, { until: (ended) => ended }).pipe(
          Effect.matchCause({
            onSuccess: () => Queue.endUnsafe(queue),
            onFailure: (cause) => Queue.failCauseUnsafe(queue, cause),
          }),
          Effect.forkScoped,
        );
      },
    ).pipe(Stream.mapEffect((value) => value));
}
