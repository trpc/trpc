import {
  Cause,
  Deferred,
  Duration,
  Effect,
  Exit,
  type Stream,
  type Tracer,
} from 'effect';
import type { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { statusOf, type AnyTrpcError } from '../../internal/error.ts';
import {
  CONTENT_TYPE,
  HEADER,
  SSE_EVENT,
  sseIdField,
} from '../../internal/protocol.ts';
import {
  createResponseHandle,
  emitEvents,
  normalizeCause,
  reportSubscriptionTeardown,
  type EventFrame,
} from '../execution/index.ts';
import type { AnyProcedure } from '../procedures/index.ts';
import { coerceError, wire, type HttpHandler } from './http-handler.ts';
import { errorResponse, linesResponse } from './responses.ts';

/** An event frame as an SSE message. */
const sseMessage = (frame: EventFrame): string => {
  if (frame.kind === 'event') {
    const id = sseIdField(frame.eventId);
    return frame.deferred === undefined
      ? `${id}data: ${JSON.stringify(frame.body)}\n\n`
      : `${id}event: ${SSE_EVENT.deferred}\ndata: ${JSON.stringify({ e: frame.deferred, body: frame.body })}\n\n`;
  }
  return `event: ${SSE_EVENT.chunk}\ndata: ${JSON.stringify(
    frame.kind === 'chunk'
      ? { e: frame.event, chunk: frame.chunk }
      : { e: frame.event },
  )}\n\n`;
};

/**
 * A subscription as server-sent events: `connected` at once, a ping
 * comment while it's quiet, then its events and `done`, or an `error`
 * event. A subscription that fails before its first event is a JSON
 * error response.
 *
 * A drain, or `sse.maxDuration` coming up, sends `reconnect`: the client
 * opens a new stream and leaves this one once that's `connected`. The
 * stream ends without `done` when the client hasn't left by the drain's
 * timeout, or at `maxDuration`. @internal
 */
export const subscription: (
  handler: HttpHandler,
  request: HttpServerRequest.HttpServerRequest,
  procedure: AnyProcedure,
  path: string,
  ctx: object,
  input: unknown,
  signal: AbortSignal,
  parent: Tracer.AnySpan | undefined,
) => Effect.Effect<HttpServerResponse.HttpServerResponse> =
  /* @__PURE__ */ Effect.fnUntraced(
    function* (handler, request, procedure, path, ctx, input, signal, parent) {
      const response = createResponseHandle();
      const exit = yield* handler.core.run({
        request,
        procedure,
        path,
        ctx,
        input,
        signal,
        response,
        lastEventId: request.headers[HEADER.lastEventId],
        parent,
        services: reportSubscriptionTeardown((err) =>
          handler.core.report(err, request, path, 'subscription'),
        ),
      });
      if (Exit.isFailure(exit)) {
        const err = normalizeCause(exit.cause);
        handler.core.report(err, request, path, 'subscription');
        return errorResponse(
          handler,
          err,
          statusOf(err, procedure['~trpc'].errors),
          response.headers,
        );
      }
      const events = exit.value as Stream.Stream<unknown, AnyTrpcError>;
      return linesResponse(
        handler,
        Effect.fnUntraced(function* (write) {
          // Servers that buffer headers until the first body chunk (Node) would
          // otherwise hold them back until the first event.
          yield* write(`event: ${SSE_EVENT.connected}\ndata: \n\n`);
          const notice = write(`event: ${SSE_EVENT.reconnect}\ndata: \n\n`);
          /** Completed to end the stream without `done`. */
          const end = Deferred.makeUnsafe<void>();
          /** Completed once the stream ends, its client gone or not. */
          const left = Deferred.makeUnsafe<void>();
          yield* Effect.addFinalizer(() => Deferred.done(left, Exit.void));
          // A stream that starts during a drain isn't asked to move, so a
          // client doesn't move back and forth to this server; it ends
          // when the handler closes.
          const leave = handler.drains.add((timeout) =>
            notice.pipe(
              Effect.andThen(
                Effect.timeoutOption(Deferred.await(left), timeout),
              ),
              Effect.andThen(Deferred.done(end, Exit.void)),
            ),
          );
          if (leave) yield* Effect.addFinalizer(() => Effect.sync(leave));
          const lifetime = handler.sseLifetime;
          if (lifetime) {
            const lead = Duration.max(
              Duration.zero,
              Duration.subtract(lifetime.end, lifetime.notice),
            );
            yield* notice.pipe(
              Effect.delay(lead),
              Effect.andThen(
                Effect.sleep(Duration.min(lifetime.notice, lifetime.end)),
              ),
              Effect.andThen(Deferred.done(end, Exit.void)),
              Effect.forkScoped,
            );
          }
          if (handler.ssePing) {
            yield* write(': ping\n\n').pipe(
              Effect.delay(handler.ssePing),
              Effect.forever,
              Effect.forkScoped,
            );
          }
          const done = yield* Effect.exit(
            emitEvents(
              events,
              handler.transformer,
              coerceError(handler, request, path, 'subscription'),
              (frame) => write(sseMessage(frame)),
            ).pipe(
              Effect.as(true),
              Effect.raceFirst(Effect.as(Deferred.await(end), false)),
            ),
          );
          if (Exit.isSuccess(done) && !done.value) return;
          if (Exit.isFailure(done)) {
            if (Cause.hasInterruptsOnly(done.cause)) return;
            const err = normalizeCause(done.cause);
            handler.core.report(err, request, path, 'subscription');
            yield* write(
              `event: error\ndata: ${JSON.stringify(wire(handler, err))}\n\n`,
            );
            return;
          }
          yield* write('event: done\ndata: \n\n');
        }, Effect.scoped),
        CONTENT_TYPE.sse,
        response.headers,
      );
    },
  );
