import { Effect, Schema, SchemaTransformation, Stream } from 'effect';
import { TrpcError, type CodeError } from '../../internal/error.ts';

const BYTE_STREAM = '~trpc.byteStream';

/**
 * Options for {@link experimental_byteStream}.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_ByteStreamOptions {
  /**
   * Fails the stream with `PAYLOAD_TOO_LARGE` once more bytes than this have
   * arrived. Unlimited by default: the handler's `maxBodySize` doesn't apply
   * to a stream, which is read as the resolver pulls it.
   */
  readonly maxBytes?: number;
}

/**
 * How reading an {@link experimental_ByteStream} fails: `PAYLOAD_TOO_LARGE`
 * past `maxBytes`, `BAD_REQUEST` when the body can't be read (the client
 * went away, or the stream was read already).
 * @since 0.1.0
 * @stability experimental
 */
export type experimental_ByteStreamError =
  | CodeError<'PAYLOAD_TOO_LARGE'>
  | CodeError<'BAD_REQUEST'>;

/**
 * A procedure's byte stream input, as its resolver reads it: an Effect
 * `Stream` over the request body, read once.
 * @since 0.1.0
 * @stability experimental
 */
export type experimental_ByteStream = Stream.Stream<
  Uint8Array,
  experimental_ByteStreamError
>;

/**
 * The schema {@link experimental_byteStream} makes: a
 * `ReadableStream<Uint8Array>` on the client, an
 * {@link experimental_ByteStream} in the resolver.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_ByteStreamSchema extends Schema.decodeTo<
  Schema.declare<experimental_ByteStream>,
  Schema.declare<ReadableStream<Uint8Array>>
> {}

const isReadableStream = (u: unknown): u is ReadableStream<Uint8Array> =>
  typeof ReadableStream !== 'undefined' && u instanceof ReadableStream;

const isByteStream = (u: unknown): u is experimental_ByteStream =>
  Stream.isStream(u);

const counted = (
  bytes: experimental_ByteStream,
  maxBytes: number,
): experimental_ByteStream =>
  Stream.suspend(() => {
    let size = 0;
    return Stream.mapEffect(bytes, (chunk) => {
      size += chunk.byteLength;
      return size > maxBytes
        ? Effect.fail(
            new TrpcError.PayloadTooLarge({
              message: `The byte stream is over ${maxBytes} bytes`,
            }),
          )
        : Effect.succeed(chunk);
    });
  });

const fromReadable = (
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): experimental_ByteStream => {
  let read = false;
  const bytes: experimental_ByteStream = Stream.suspend(() => {
    if (read || body.locked) {
      return Stream.fail(
        new TrpcError.BadRequest({
          message: 'The byte stream can only be read once',
        }),
      );
    }
    read = true;
    return Stream.fromReadableStream({
      evaluate: () => body,
      onError: (cause) =>
        new TrpcError.BadRequest({
          message: 'Could not read the byte stream',
          cause,
        }),
    });
  });
  return Number.isFinite(maxBytes) ? counted(bytes, maxBytes) : bytes;
};

/**
 * A procedure input that is the request body itself, streamed: the client
 * passes a `ReadableStream<Uint8Array>`, which `httpLink` sends as an
 * `application/octet-stream` body of its own, and the resolver reads it as
 * an Effect `Stream` while it arrives. Only the whole input can be a stream;
 * send metadata in headers or another call.
 *
 * @example
 * ```ts
 * const upload = t.procedure
 *   .input(experimental_byteStream({ maxBytes: 50_000_000 }))
 *   .mutation(({ input }) =>
 *     Stream.runFold(input, () => 0, (n, chunk) => n + chunk.byteLength),
 *   );
 * // client
 * await client.upload.mutate(file.stream());
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_byteStream(
  opts: experimental_ByteStreamOptions = {},
): experimental_ByteStreamSchema {
  const maxBytes = opts.maxBytes ?? Infinity;
  return Schema.declare(isReadableStream, {
    expected: 'ReadableStream<Uint8Array>',
  })
    .pipe(
      Schema.decodeTo(
        Schema.declare(isByteStream, { expected: 'Stream<Uint8Array>' }),
        SchemaTransformation.transform({
          decode: (body) => fromReadable(body, maxBytes),
          encode: (bytes) => Stream.toReadableStream(bytes),
        }),
      ),
    )
    .annotate({ [BYTE_STREAM]: true });
}

/** Whether `schema` came from {@link experimental_byteStream}. @internal */
export const isByteStreamSchema = (schema: unknown): boolean =>
  Schema.isSchema(schema) &&
  Schema.resolveAnnotations(schema)?.[BYTE_STREAM] === true;
