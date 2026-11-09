import { Effect, Exit, Fiber, Request, RequestResolver, Scope } from 'effect';
import type { AnyTrpcError } from '../../../internal/error.ts';
import { badResponse } from '../events.ts';

/** Calls gathered into one batch, for a transport to answer. */
export interface Batch<C> {
  readonly calls: ReadonlyArray<C>;
  /**
   * Closed when a caller stops waiting and every other call is gone too
   * (answered, or its caller stopped waiting): the batch is no longer needed.
   */
  readonly scope: Scope.Scope;
  /** Answers call `i` now. A call keeps its first answer. */
  readonly settle: (i: number, exit: Exit.Exit<unknown, AnyTrpcError>) => void;
  /** Answers call `i` with `result` once it finishes; the batch waits for it. */
  readonly settleWith: (
    i: number,
    result: Effect.Effect<unknown, AnyTrpcError>,
  ) => Effect.Effect<void>;
}

/**
 * A data loader: calls made in the same macrotask with the same `key` go to
 * `send` together, at most `maxItems` at a time. When `send` ends, the calls
 * it didn't answer fail with its error, or as unanswered if it succeeded.
 */
export function makeBatcher<C>(opts: {
  readonly key: (call: C) => string;
  readonly maxItems: number;
  readonly send: (batch: Batch<C>) => Effect.Effect<void, AnyTrpcError>;
}): (call: C) => Effect.Effect<unknown, AnyTrpcError> {
  /**
   * A call waiting for its batch. `gone` once it settled or its caller
   * stopped waiting; `onAbort` closes the batch's scope once every call in
   * it is gone.
   */
  interface Pending extends Request.Request<unknown, AnyTrpcError> {
    readonly call: C;
    readonly key: string;
    gone: boolean;
    onAbort?: Effect.Effect<void>;
  }
  const Pending = Request.of<Pending>();

  const runAll = (
    entries: ReadonlyArray<Request.Entry<Pending>>,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const onAbort = Effect.suspend(() =>
        entries.every((entry) => entry.request.gone)
          ? Scope.close(scope, Exit.void)
          : Effect.void,
      );
      for (const entry of entries) entry.request.onAbort = onAbort;
      const settle = (i: number, exit: Exit.Exit<unknown, AnyTrpcError>) => {
        const entry = entries[i];
        if (!entry) return;
        entry.request.gone = true;
        entry.completeUnsafe(exit);
      };
      /**
       * Answers still resolving. `Effect.request` fails the calls a batch
       * ends without settling, so the batch waits for them.
       */
      const heads: Array<Fiber.Fiber<void>> = [];
      const exit = yield* Effect.exit(
        opts.send({
          calls: entries.map((entry) => entry.request.call),
          scope,
          settle,
          settleWith: (i, result) =>
            Effect.exit(result).pipe(
              Effect.map((exit) => settle(i, exit)),
              Effect.forkDetach,
              Effect.map((fiber) => {
                heads.push(fiber);
              }),
            ),
        }),
      );
      yield* Fiber.awaitAll(heads);
      // Only calls the transport never answered are still open.
      const rest = Exit.isFailure(exit)
        ? exit
        : Exit.fail(badResponse('The batch response ended without a result')());
      for (const i of entries.keys()) settle(i, rest);
    });

  const resolver = RequestResolver.makeWith<Pending>({
    batchKey: (entry) => entry.request.key,
    // A macrotask, so calls started in the same tick share a batch.
    delay: Effect.sleep(0),
    collectWhile: (entries) => entries.size < opts.maxItems,
    runAll,
  });

  return (call) =>
    Effect.suspend(() => {
      const request = Pending({ call, key: opts.key(call), gone: false });
      return Effect.request(request, resolver).pipe(
        Effect.onInterrupt(() =>
          Effect.suspend(() => {
            request.gone = true;
            return request.onAbort ?? Effect.void;
          }),
        ),
      );
    });
}
