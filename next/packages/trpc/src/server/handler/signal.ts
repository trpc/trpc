import { Effect, Exit, Scope, Stream } from 'effect';
import { HttpBody, HttpServerResponse } from 'effect/http';
import { linesBody } from './responses.ts';

/** An `AbortSignal` released with `scope`: it aborts when the scope closes on an interruption. */
const signalIn = (scope: Scope.Scope): Effect.Effect<AbortSignal> =>
  Effect.acquireRelease(
    Effect.sync(() => new AbortController()),
    (controller, exit) =>
      Exit.hasInterrupts(exit)
        ? Effect.sync(() => controller.abort())
        : Effect.void,
  ).pipe(
    Effect.map((controller) => controller.signal),
    Scope.provide(scope),
  );

/**
 * Runs an HTTP call with the `AbortSignal` that `createContext` and its
 * procedures get. The signal belongs to a scope of the call's, which
 * closes with the call's exit or, when it answers with lines it goes on
 * producing (`linesResponse`), with their stream's, as Effect's servers
 * hand a request's scope to its body (`HttpEffect.scopeTransferToStream`).
 * So it aborts when the client leaves while the call runs or while its
 * lines stream; a `Blob` or a procedure's own response streams on its own.
 * @internal
 */
export const withCallSignal = <E>(
  call: (
    signal: AbortSignal,
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, E> =>
  Effect.flatMap(Scope.make(), (scope) =>
    Effect.flatMap(signalIn(scope), (signal) =>
      Effect.onExit(call(signal), (exit) =>
        Exit.isSuccess(exit) && linesBody(exit.value)
          ? Effect.void
          : Scope.close(scope, exit),
      ).pipe(
        Effect.map((response) => {
          const body = linesBody(response);
          return body
            ? HttpServerResponse.setBody(
                response,
                HttpBody.stream(
                  Stream.onExit(body.stream, (exit) =>
                    Scope.close(scope, exit),
                  ),
                  body.contentType,
                  body.contentLength,
                ),
              )
            : response;
        }),
      ),
    ),
  );
