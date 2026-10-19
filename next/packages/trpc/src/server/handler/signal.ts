import { Effect, Exit, Stream } from 'effect';
import { HttpBody, HttpServerResponse } from 'effect/http';
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
  Effect.suspend(() => {
    const controller = new AbortController();
    const abortOnInterrupt = (exit: Exit.Exit<unknown, unknown>) =>
      Exit.hasInterrupts(exit)
        ? Effect.sync(() => controller.abort())
        : Effect.void;
    return Effect.map(
      Effect.onExit(call(controller.signal), abortOnInterrupt),
      (response) => {
        const body = linesBody(response);
        return body
          ? HttpServerResponse.setBody(
              response,
              HttpBody.stream(
                Stream.onExit(body.stream, abortOnInterrupt),
                body.contentType,
                body.contentLength,
              ),
            )
          : response;
      },
    );
  });
