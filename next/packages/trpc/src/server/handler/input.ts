import { Effect, Exit } from 'effect';
import type { HttpServerRequest } from 'effect/http';
import {
  TrpcError,
  type CodeError,
  type Failure,
} from '../../internal/error.ts';
import {
  CONTENT_TYPE,
  fromInputSearch,
  HEADER,
  isJsonContentType,
  isMultipartContentType,
  isOctetContentType,
} from '../../internal/protocol.ts';
import type { AnyTransformer } from '../../transformer/index.ts';
import type { AnyProcedure } from '../procedures/index.ts';
import { isByteStreamSchema } from '../validation/index.ts';
import {
  bodyStream,
  consumedError,
  parsedBody,
  readBytes,
  type BodyError,
} from './body.ts';
import { protocolError, type HttpHandler } from './http-handler.ts';

const decoder = /* @__PURE__ */ new TextDecoder();

/** What reading a call's input can fail with. @internal */
export type InputError =
  | CodeError<'UNSUPPORTED_MEDIA_TYPE'>
  | BodyError
  | Failure<'InvalidBody' | 'MissingInputField'>;

const invalidInput = (cause: unknown): Failure<'InvalidBody'> =>
  new TrpcError.ParseError({
    tag: 'InvalidBody',
    message: cause instanceof Error ? cause.message : 'Invalid input',
    cause,
  });

const noInput = /* @__PURE__ */ Exit.succeed(undefined);

/**
 * `Effect.try`, evaluated now: decoding is synchronous, and a call goes on
 * from an `Exit` without a step (`Effect.flatMapEager`).
 */
const decodeNow = <A>(
  decode: () => A,
): Exit.Exit<A, Failure<'InvalidBody'>> => {
  try {
    return Exit.succeed(decode());
  } catch (cause) {
    return Exit.fail(invalidInput(cause));
  }
};

/**
 * A wire input as the procedure's input, with `parts` for the blobs a
 * multipart body carried. @internal
 */
export const deserialize = (
  serializer: AnyTransformer,
  value: unknown,
  parts?: ReadonlyArray<Blob>,
): Exit.Exit<unknown, Failure<'InvalidBody'>> =>
  value === undefined
    ? noInput
    : decodeNow(() =>
        serializer.deserialize(value as never, { input: true, parts }),
      );

const parseJson = (text: string) =>
  Effect.try({
    try: () => (text === '' ? undefined : (JSON.parse(text) as unknown)),
    catch: (cause) =>
      new TrpcError.ParseError({
        tag: 'InvalidBody',
        message: 'Invalid JSON',
        cause,
      }),
  });

/** A JSON request body, parsed. @internal */
export const readBody: (
  request: HttpServerRequest.HttpServerRequest,
  maxBodySize: number,
) => Effect.Effect<unknown, InputError> = /* @__PURE__ */ Effect.fnUntraced(
  function* (request, maxBodySize) {
    if (parsedBody(request) === 'consumed') {
      return yield* Effect.fail(consumedError());
    }
    if (!isJsonContentType(request.headers['content-type'] ?? null)) {
      return yield* Effect.fail(
        protocolError(
          'UNSUPPORTED_MEDIA_TYPE',
          'POST requests must have content-type: application/json',
        ),
      );
    }
    const bytes = yield* readBytes(request, maxBodySize);
    return yield* parseJson(decoder.decode(bytes));
  },
);

/** An `input` field with the serialized JSON, and parts `0`, `1`, … for its blobs. */
const readMultipart = /* @__PURE__ */ Effect.fnUntraced(function* (
  handler: HttpHandler,
  request: HttpServerRequest.HttpServerRequest,
) {
  const bytes = yield* readBytes(request, handler.maxBodySize);
  const form = yield* Effect.tryPromise({
    try: () =>
      new globalThis.Response(bytes as BodyInit, {
        // Only multipart requests get here.
        headers: { 'content-type': request.headers['content-type']! },
      }).formData(),
    catch: (cause) =>
      new TrpcError.ParseError({
        tag: 'InvalidBody',
        message: 'Invalid multipart body',
        cause,
      }),
  });
  const field = form.get('input');
  if (typeof field !== 'string') {
    return yield* Effect.fail(
      protocolError(
        'BAD_REQUEST',
        'A multipart body needs an "input" field',
        'MissingInputField',
      ),
    );
  }
  const value = yield* parseJson(field);
  const parts: Blob[] = [];
  for (;;) {
    const part = form.get(String(parts.length));
    if (!(part instanceof Blob)) break;
    parts.push(part);
  }
  return yield* deserialize(handler.serializer, value, parts);
});

const takesByteStream = (procedure: AnyProcedure): boolean =>
  procedure['~trpc'].steps.some(
    (step) => step.kind === 'input' && isByteStreamSchema(step.arg),
  );

/**
 * A call's input: the search's `input` for GET, else the body as JSON,
 * multipart or, for a byte stream input, the unread bytes. @internal
 */
export const readInput = (
  handler: HttpHandler,
  request: HttpServerRequest.HttpServerRequest,
  search: string,
  procedure: AnyProcedure,
): Effect.Effect<unknown, InputError> => {
  if (request.method === 'GET') {
    if (search.length <= 1) return noInput;
    return Effect.flatMapEager(
      decodeNow(() => fromInputSearch(search)),
      (value) => deserialize(handler.serializer, value),
    );
  }
  const contentType = request.headers['content-type'] ?? null;
  if (isMultipartContentType(contentType)) {
    // A cross-site form can send multipart without a preflight; it can't add a header.
    if (request.headers[HEADER.version] === undefined) {
      return Effect.fail(
        protocolError(
          'UNSUPPORTED_MEDIA_TYPE',
          `multipart/form-data requests need the ${HEADER.version} header`,
        ),
      );
    }
    return readMultipart(handler, request);
  }
  if (isOctetContentType(contentType)) {
    if (!takesByteStream(procedure)) {
      return Effect.fail(
        protocolError(
          'UNSUPPORTED_MEDIA_TYPE',
          `${CONTENT_TYPE.octet} bodies are for procedures whose input is experimental_byteStream()`,
        ),
      );
    }
    if (request.headers[HEADER.version] === undefined) {
      return Effect.fail(
        protocolError(
          'UNSUPPORTED_MEDIA_TYPE',
          `${CONTENT_TYPE.octet} requests need the ${HEADER.version} header`,
        ),
      );
    }
    return bodyStream(request);
  }
  return Effect.flatMap(readBody(request, handler.maxBodySize), (body) =>
    deserialize(handler.serializer, body),
  );
};
