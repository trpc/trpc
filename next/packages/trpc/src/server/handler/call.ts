import { Context, Effect, Exit, Stream, type Tracer } from 'effect';
import { HttpServerResponse, type HttpServerRequest } from 'effect/http';
import { statusOf, type AnyTrpcError } from '../../internal/error.ts';
import { blobHeaders } from '../../internal/protocol.ts';
import type { ProcedureType } from '../../internal/types.ts';
import type { Chunk, Frame } from '../../serializer/danson/index.ts';
import {
  createResponseHandle,
  CurrentFrameSink,
  normalizeCause,
  unexpectedError,
  type FrameSink,
} from '../execution/index.ts';
import { resolveProcedure, type AnyProcedure } from '../procedures/index.ts';
import { CurrentPlatform } from './platform.ts';
import {
  coerceError,
  protocolError,
  wire,
  type HttpHandler,
} from './http-handler.ts';
import { readInput } from './input.ts';
import {
  errorResponse,
  jsonResponse,
  linesResponse,
  rawResponse,
  respond,
  runChunks,
  streamType,
} from './responses.ts';
import { withCallSignal } from './signal.ts';
import { subscription } from './subscription.ts';

/** A query's or mutation's outcome, serialized, before it's a response. @internal */
export interface CallResult {
  readonly status: number;
  readonly body: unknown;
  readonly chunks?: Stream.Stream<Chunk, unknown> | undefined;
  readonly headers?: Headers | undefined;
  /** A root `File` or `Blob` output, sent as the body of an unbatched call. */
  readonly blob?: Blob | undefined;
  /** What the procedure returned instead of a value, sent as is. */
  readonly response?: HttpServerResponse.HttpServerResponse | undefined;
  /** Frames `experimental_durable()` keeps, sent instead of `body` and `chunks`. */
  readonly frames?: Stream.Stream<Frame> | undefined;
}

/** `createContext` for the calls of one request, with the request's platform. @internal */
export const makeContext = (
  handler: HttpHandler,
  request: HttpServerRequest.HttpServerRequest,
  calls: ReadonlyArray<{ path: string; type: ProcedureType }>,
  signal: AbortSignal,
): Effect.Effect<object, AnyTrpcError> =>
  Effect.flatMap(CurrentPlatform, (platform) =>
    handler.core.makeContext({ request, platform, calls, signal }),
  );

/**
 * Runs a query or mutation and serializes the outcome. An unbatched
 * (`single`) call may return a response or a `Blob`, and keeps its frames
 * for `experimental_durable()`. @internal
 */
export const execute = (
  handler: HttpHandler,
  request: HttpServerRequest.HttpServerRequest,
  procedure: AnyProcedure,
  path: string,
  ctx: object,
  input: unknown,
  signal: AbortSignal,
  parent: Tracer.AnySpan | undefined,
  single = false,
): Effect.Effect<CallResult> => {
  const type = procedure['~trpc'].type;
  const response = createResponseHandle();
  const { headers } = response;
  const sink: FrameSink = {};
  const failed = (err: AnyTrpcError): CallResult => {
    handler.core.report(err, request, path, type);
    return {
      status: statusOf(err, procedure['~trpc'].errors),
      body: wire(handler, err),
      headers,
    };
  };
  const toResult = (exit: Exit.Exit<unknown, AnyTrpcError>): CallResult => {
    if (Exit.isFailure(exit)) return failed(normalizeCause(exit.cause));
    const value = exit.value;
    if (sink.replay) {
      return { status: 200, body: undefined, frames: sink.replay, headers };
    }
    if (HttpServerResponse.isHttpServerResponse(value)) {
      return {
        status: value.status,
        body: undefined,
        response: value,
        headers,
      };
    }
    const status = response.status ?? 200;
    if (single && value instanceof Blob) {
      return { status, body: undefined, blob: value, headers };
    }
    try {
      const serialized = handler.serializer.serializeDeferred(value, {
        coerceError: coerceError(handler, request, path, type),
      });
      const { chunks } = serialized;
      if (chunks && sink.keep) {
        const frames = sink.keep(serialized.head, chunks);
        return { status, body: undefined, frames, headers };
      }
      return { status, body: serialized.head, chunks, headers };
    } catch (cause) {
      return failed(unexpectedError(cause));
    }
  };
  return Effect.map(
    handler.core.run({
      request,
      procedure,
      path,
      ctx,
      input,
      signal,
      response,
      allowResponse: single,
      parent,
      services: single ? Context.make(CurrentFrameSink, sink) : undefined,
    }),
    toResult,
  );
};

const resultResponse = (
  handler: HttpHandler,
  request: HttpServerRequest.HttpServerRequest,
  result: CallResult,
): HttpServerResponse.HttpServerResponse => {
  if (result.response) return rawResponse(result.response, result.headers);
  if (result.blob) {
    return respond(
      handler,
      result.status,
      result.blob,
      result.blob.type || 'application/octet-stream',
      blobHeaders(result.blob),
      result.headers,
    );
  }
  if (result.frames) {
    const frames = result.frames;
    return linesResponse(
      handler,
      (write) => Stream.runForEach(frames, write),
      streamType(request),
      result.headers,
    );
  }
  const chunks = result.chunks;
  if (!chunks) {
    return jsonResponse(handler, result.status, result.body, result.headers);
  }
  return linesResponse(
    handler,
    (write) => Effect.andThen(write(result.body), runChunks(chunks, write)),
    streamType(request),
    result.headers,
  );
};

/** One call: the procedure at `path`, its input from the request. @internal */
export const singleCall = (
  handler: HttpHandler,
  request: HttpServerRequest.HttpServerRequest,
  search: string,
  path: string,
  parent: Tracer.AnySpan | undefined,
): Effect.Effect<HttpServerResponse.HttpServerResponse, AnyTrpcError> =>
  Effect.flatMapEager(
    resolveProcedure(handler.router, path),
    (
      procedure,
    ): Effect.Effect<HttpServerResponse.HttpServerResponse, AnyTrpcError> => {
      if (!procedure) {
        return Effect.fail(
          protocolError(
            'NOT_FOUND',
            `No procedure at path "${path}"`,
            'ProcedureNotFound',
          ),
        );
      }
      const type = procedure['~trpc'].type;
      if (type === 'mutation' && request.method !== 'POST') {
        return Effect.fail(
          protocolError(
            'METHOD_NOT_SUPPORTED',
            'Mutations must use POST',
            'ProcedureTypeMismatch',
          ),
        );
      }
      if (
        request.method !== 'GET' &&
        request.method !== 'POST' &&
        !((request.method as string) === 'QUERY' && type !== 'mutation')
      ) {
        return Effect.fail(
          protocolError(
            'METHOD_NOT_SUPPORTED',
            `${request.method} is not supported`,
          ),
        );
      }
      const call = Effect.flatMapEager(
        readInput(handler, request, search, procedure),
        (input) =>
          withCallSignal((signal) =>
            Effect.flatMapEager(
              makeContext(handler, request, [{ path, type }], signal),
              (ctx) =>
                type === 'subscription'
                  ? subscription(
                      handler,
                      request,
                      procedure,
                      path,
                      ctx,
                      input,
                      signal,
                      parent,
                    )
                  : Effect.map(
                      execute(
                        handler,
                        request,
                        procedure,
                        path,
                        ctx,
                        input,
                        signal,
                        parent,
                        true,
                      ),
                      (result) => resultResponse(handler, request, result),
                    ),
            ),
          ),
      );
      return Effect.catch(call, (err) => {
        handler.core.report(err, request, path, type);
        return Effect.succeed(errorResponse(handler, err));
      });
    },
  );
