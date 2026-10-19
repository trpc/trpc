import { Effect, type Tracer } from 'effect';
import type { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { statusOf, type AnyTrpcError } from '../../internal/error.ts';
import type { BatchCall, BatchLine } from '../../internal/protocol.ts';
import {
  resolveProcedureEffect,
  type AnyProcedure,
} from '../procedures/index.ts';
import { strictestCacheControl } from './cache-control.ts';
import { execute, makeContext, type CallResult } from './call.ts';
import { protocolError, wire, type HttpHandler } from './http-handler.ts';
import { deserialize, readBody } from './input.ts';
import { linesResponse, runChunks, streamType } from './responses.ts';
import { withCallSignal } from './signal.ts';

interface Resolved {
  readonly path: string;
  readonly input: unknown;
  readonly procedure: AnyProcedure | undefined;
}

/** One call of a batch; what fails is its line's error. */
const batchedCall = (
  handler: HttpHandler,
  request: HttpServerRequest.HttpServerRequest,
  call: Resolved,
  ctx: object,
  signal: AbortSignal,
  parent: Tracer.AnySpan | undefined,
): Effect.Effect<CallResult> => {
  const procedure = call.procedure;
  const result: Effect.Effect<CallResult, AnyTrpcError> = !procedure
    ? Effect.fail(
        protocolError('NOT_FOUND', `No procedure at path "${call.path}"`),
      )
    : procedure['~trpc'].type === 'subscription'
      ? Effect.fail(
          protocolError('BAD_REQUEST', 'Subscriptions cannot be batched'),
        )
      : Effect.flatMapEager(
          deserialize(handler.serializer, call.input),
          (input) =>
            execute(
              handler,
              request,
              procedure,
              call.path,
              ctx,
              input,
              signal,
              parent,
            ),
        );
  return Effect.catch(result, (err) => {
    handler.core.report(err, request, call.path);
    return Effect.succeed({ status: statusOf(err), body: wire(handler, err) });
  });
};

/** The calls' headers merged: cookies appended, the strictest `cache-control`. */
const mergedHeaders = (results: ReadonlyArray<CallResult>): Headers => {
  const headers = new Headers();
  for (const result of results) {
    for (const [key, value] of result.headers ?? []) {
      if (key === 'set-cookie') headers.append(key, value);
      else if (key !== 'cache-control') headers.set(key, value);
    }
  }
  const cacheControl = strictestCacheControl(
    results.map((result) => result.headers?.get('cache-control')),
  );
  if (cacheControl) headers.set('cache-control', cacheControl);
  return headers;
};

/**
 * A batch: a POSTed array of calls sharing one `createContext`, answered
 * as lines indexed by call, each call's deferred chunks after its head.
 * @internal
 */
export const batched: (
  handler: HttpHandler,
  request: HttpServerRequest.HttpServerRequest,
  parent: Tracer.AnySpan | undefined,
) => Effect.Effect<HttpServerResponse.HttpServerResponse, AnyTrpcError> =
  Effect.fnUntraced(function* (handler, request, parent) {
    const batch = handler.batch;
    if (!batch) {
      return yield* Effect.fail(
        protocolError('BAD_REQUEST', 'Batching is not enabled'),
      );
    }
    if (request.method !== 'POST') {
      return yield* Effect.fail(
        protocolError('METHOD_NOT_SUPPORTED', 'Batches must use POST'),
      );
    }
    const body = yield* readBody(request, handler.maxBodySize);
    if (!Array.isArray(body)) {
      return yield* Effect.fail(
        protocolError('BAD_REQUEST', 'A batch body must be an array'),
      );
    }
    if (body.length > batch.maxItems) {
      return yield* Effect.fail(
        protocolError(
          'PAYLOAD_TOO_LARGE',
          `A batch can have at most ${batch.maxItems} calls`,
        ),
      );
    }
    const calls = yield* Effect.forEach(
      body as BatchCall[],
      (call) => {
        const path = typeof call?.path === 'string' ? call.path : '';
        return Effect.map(
          resolveProcedureEffect(handler.router, path),
          (procedure): Resolved => ({ path, input: call?.input, procedure }),
        );
      },
      { concurrency: 'unbounded' },
    );
    return yield* withCallSignal(
      Effect.fnUntraced(function* (signal) {
        const ctx = yield* makeContext(
          handler,
          request,
          calls.flatMap((call) =>
            call.procedure
              ? [{ path: call.path, type: call.procedure['~trpc'].type }]
              : [],
          ),
          signal,
        );
        // Headers are sent first, so the response waits for every call's head
        // to merge their headers (04 (d)). Deferred values still stream.
        const results = yield* Effect.forEach(
          calls,
          (call) => batchedCall(handler, request, call, ctx, signal, parent),
          { concurrency: 'unbounded' },
        );
        return linesResponse(
          handler,
          (write) =>
            Effect.forEach(
              results,
              (result, i) =>
                Effect.andThen(
                  write({
                    i,
                    status: result.status,
                    body: result.body,
                  } satisfies BatchLine),
                  result.chunks
                    ? runChunks(result.chunks, (chunk) =>
                        write({ i, chunk } satisfies BatchLine),
                      )
                    : Effect.void,
                ),
              { concurrency: 'unbounded', discard: true },
            ),
          streamType(request),
          mergedHeaders(results),
        );
      }),
    );
  });
