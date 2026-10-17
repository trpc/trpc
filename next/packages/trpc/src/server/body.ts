import { Effect, Stream } from 'effect';
import { Cookies, type HttpServerRequest } from 'effect/http';
import { TrpcError, type AnyTrpcError } from '../internal/error.ts';
import { isJsonContentType } from '../internal/protocol.ts';

const encoder = new TextEncoder();

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
export const consumedError = (): AnyTrpcError =>
  new TrpcError({
    code: 'INTERNAL_SERVER_ERROR',
    message:
      'The request body was already read by another middleware. Mount tRPC before body parsers, or use one that sets req.body.',
  });

/**
 * The body, at most `maxBodySize` bytes. Past it, the rest is drained, not
 * cancelled: cancelling makes some servers (Node) drop the connection
 * before the 413 is sent.
 * @internal
 */
export const readBytes = (
  request: HttpServerRequest.HttpServerRequest,
  maxBodySize: number,
): Effect.Effect<Uint8Array, AnyTrpcError> =>
  Effect.gen(function* () {
    const tooLarge = new TrpcError({
      code: 'PAYLOAD_TOO_LARGE',
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
            new TrpcError({
              code: 'BAD_REQUEST',
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
