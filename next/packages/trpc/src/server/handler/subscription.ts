import { Cause, Effect, Exit, type Stream, type Tracer } from 'effect';
import type { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { statusOf, type AnyTrpcError } from '../../internal/error.ts';
import { CONTENT_TYPE, HEADER, SSE_EVENT } from '../../internal/protocol.ts';
import {
  createResponseHandle,
  emitEvents,
  normalizeCause,
  type EventFrame,
} from '../execution/index.ts';
import type { AnyProcedure } from '../procedures/index.ts';
import { coerceError, wire, type HttpHandler } from './http-handler.ts';
import { errorResponse, linesResponse } from './responses.ts';

/** An event frame as an SSE message. */
const sseMessage = (frame: EventFrame): string => {
  if (frame.kind === 'event') {
    const id = frame.eventId === undefined ? '' : `id: ${frame.eventId}\n`;
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
 * A subscription as server-sent events: `: open` at once, a ping comment
 * while it's quiet, then its events and `done`, or an `error` event. A
 * subscription that fails before its first event is a JSON error
 * response. @internal
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
          yield* write(': open\n\n');
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
              handler.serializer,
              coerceError(handler, request, path, 'subscription'),
              (frame) => write(sseMessage(frame)),
            ),
          );
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
