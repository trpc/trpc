import { Effect } from 'effect';
import { HttpBody, HttpServerResponse } from 'effect/http';
import { interruptSignal } from '../../internal/effects.ts';
import { linesBody } from './responses.ts';

/**
 * Runs an HTTP call with the `AbortSignal` that `createContext` and its
 * procedures get. It aborts when the call is interrupted (the client left)
 * or, when the call answers with lines it goes on producing
 * (`linesResponse`), when their stream is. A `Blob` or a procedure's own
 * response streams on its own.
 * @internal
 */
export const withCallSignal = <E>(
  call: (
    signal: AbortSignal,
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, E> =>
  Effect.flatMap(interruptSignal(), (interrupt) =>
    Effect.map(
      interrupt.abortOnInterrupt(call(interrupt.signal)),
      (response) => {
        const body = linesBody(response);
        return body
          ? HttpServerResponse.setBody(
              response,
              HttpBody.stream(
                interrupt.abortOnInterrupt(body.stream),
                body.contentType,
                body.contentLength,
              ),
            )
          : response;
      },
    ),
  );
