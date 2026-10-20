import { Cause, Effect, Exit, Scope, Stream, type Context } from 'effect';
import { Cookies, type HttpServerRequest } from 'effect/http';
import {
  TrpcError,
  type CodeError,
  type Failure,
} from '../../internal/error.ts';
import { isJsonContentType } from '../../internal/protocol.ts';

const encoder = /* @__PURE__ */ new TextEncoder();

/** `Headers` from a response handle, as `HttpServerResponse` options. @internal */
export const responseOptions = (
  set: Headers | undefined,
): { headers?: Record<string, string>; cookies?: Cookies.Cookies } => {
  if (!set) return {};
  const headers: Record<string, string> = {};
  for (const [key, value] of set) {
    if (key !== 'set-cookie') headers[key] = value;
  }
  const setCookie = set.getSetCookie();
  return {
    headers,
    ...(setCookie.length ? { cookies: Cookies.fromSetCookie(setCookie) } : {}),
  };
};

/** A request body a Node framework middleware already read (`express.json()`). @internal */
export const parsedBody = (
  request: HttpServerRequest.HttpServerRequest,
): Uint8Array | 'consumed' | undefined => {
  const node = request.source as { readableEnded?: unknown; body?: unknown };
  if (node.readableEnded !== true) return undefined;
  const { body } = node;
  if (typeof body === 'string') return encoder.encode(body);
  if (body instanceof Uint8Array) return body;
  if (
    body !== undefined &&
    isJsonContentType(request.headers['content-type'] ?? null)
  ) {
    return encoder.encode(JSON.stringify(body));
  }
  return 'consumed';
};

/** @internal */
export const consumedError = (): Failure<'BodyConsumed'> =>
  new TrpcError.InternalServerError({
    tag: 'BodyConsumed',
    message:
      'The request body was already read by another middleware. Mount tRPC before body parsers, or use one that sets req.body.',
  });

/**
 * `bytes` as a web stream that starts reading at the first read and, when
 * cancelled, reads the rest and drops it: Node drops the connection before
 * the response is sent when a request body is destroyed half-read. Reads
 * run with `context`, the request's.
 */
const drainingStream = (
  bytes: Stream.Stream<Uint8Array, unknown>,
  context: Context.Context<never>,
): ReadableStream<Uint8Array> => {
  const scope = Scope.makeUnsafe();
  const close = Scope.close(scope, Exit.void);
  let opened: Effect.Effect<ReadonlyArray<Uint8Array>, unknown> | undefined;
  const open = Effect.suspend(() =>
    opened
      ? Effect.succeed(opened)
      : Stream.toPull(bytes).pipe(
          Scope.provide(scope),
          Effect.tap((pull) =>
            Effect.sync(() => {
              opened = pull;
            }),
          ),
        ),
  );
  return new ReadableStream<Uint8Array>(
    {
      pull: (controller) =>
        Effect.runPromiseWith(context)(
          open.pipe(
            Effect.flatten,
            Effect.matchEffect({
              onSuccess: (chunks) =>
                Effect.sync(() => {
                  for (const chunk of chunks) controller.enqueue(chunk);
                }),
              onFailure: (error) =>
                Effect.andThen(
                  close,
                  Effect.sync(() =>
                    Cause.isDone(error)
                      ? controller.close()
                      : controller.error(error),
                  ),
                ),
            }),
          ),
        ),
      cancel: () => {
        Effect.runForkWith(context)(
          Effect.ignore(Effect.forever(Effect.flatten(open))).pipe(
            Effect.ensuring(close),
          ),
        );
      },
    },
    { highWaterMark: 0 },
  );
};

/**
 * The body as a web stream, unread, for a byte stream input to pull. A body
 * a Node parser already read (`express.raw()`) is replayed.
 * @internal
 */
export const bodyStream = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<ReadableStream<Uint8Array>, Failure<'BodyConsumed'>> =>
  Effect.suspend(() => {
    const replayed = parsedBody(request);
    if (replayed === 'consumed') return Effect.fail(consumedError());
    if (replayed) {
      return Effect.succeed(Stream.toReadableStream(Stream.make(replayed)));
    }
    if (request.source instanceof Request) {
      return Effect.succeed(
        request.source.body ?? Stream.toReadableStream(Stream.empty),
      );
    }
    return Effect.map(Effect.context(), (context) =>
      drainingStream(request.stream, context),
    );
  });

/** What reading a body can fail with. @internal */
export type BodyError =
  | CodeError<'PAYLOAD_TOO_LARGE'>
  | Failure<'UnreadableBody' | 'BodyConsumed'>;

/**
 * The body, at most `maxBodySize` bytes. Past it, the rest is drained, not
 * cancelled: cancelling makes some servers (Node) drop the connection
 * before the 413 is sent.
 * @internal
 */
export const readBytes = (
  request: HttpServerRequest.HttpServerRequest,
  maxBodySize: number,
): Effect.Effect<Uint8Array, BodyError> =>
  Effect.gen(function* () {
    const tooLarge = new TrpcError.PayloadTooLarge({
      message: 'Request body is too large',
    });
    if (Number(request.headers['content-length'] ?? 0) > maxBodySize) {
      return yield* Effect.fail(tooLarge);
    }
    const replayed = parsedBody(request);
    if (replayed === 'consumed') return yield* Effect.fail(consumedError());
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (request.source instanceof Request && request.source.body === null) {
      // No body: nothing to read.
    } else if (replayed) {
      chunks.push(replayed);
      size = replayed.byteLength;
    } else {
      yield* Stream.runForEach(request.stream, (chunk) =>
        Effect.sync(() => {
          size += chunk.byteLength;
          if (size <= maxBodySize) chunks.push(chunk);
        }),
      ).pipe(
        Effect.mapError(
          (cause) =>
            new TrpcError.BadRequest({
              tag: 'UnreadableBody',
              message: 'Could not read the request body',
              cause,
            }),
        ),
      );
    }
    if (size > maxBodySize) return yield* Effect.fail(tooLarge);
    if (chunks.length === 1) return chunks[0]!;
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  });
