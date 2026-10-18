import { Data } from 'effect';

import {
  codeOfStatus,
  isTrpcError,
  REASON,
  TrpcError,
  type AnyTrpcError,
  type BuiltinErrorCode,
  type TrpcErrorOptions,
} from './error.ts';

/**
 * Why tRPC failed a call itself, on {@link TrpcError}'s `reason`. Each reason
 * has one built-in code, and tells apart the failures that share it:
 *
 * ```ts
 * createFetchHandler({
 *   router,
 *   onError: (opts) => {
 *     if (Predicate.isTagged(opts.error.reason, 'BodyTooLarge')) {
 *       metrics.increment('trpc.body_too_large');
 *     }
 *   },
 * });
 * ```
 *
 * Errors you make, and errors that crossed a wire, have no reason: it stays
 * on the side that made it.
 *
 * @since 0.1.0
 * @stability stable
 */
export type TrpcErrorReason = Data.TaggedEnum<{
  // Reading a request
  BodyTooLarge: { readonly limit: number };
  BodyUnreadable: {};
  /** A body parser mounted before tRPC read the body without keeping it. */
  BodyConsumed: {};
  InvalidJson: {};
  InvalidMultipart: {};
  InvalidFormBody: {};
  MultipartWithoutInput: {};
  /** The serializer couldn't decode the input. */
  UndecodableInput: {};
  JsonContentTypeRequired: {};
  /** The header a cross-site form can't send, so multipart needs it. */
  MultipartWithoutVersionHeader: { readonly header: string };
  UnsupportedBodyType: {};

  // Finding the procedure
  ProcedureNotFound: { readonly path: string };
  WrongProcedureType: {
    readonly path: string;
    readonly type: string;
    readonly expected: string;
  };
  MutationNeedsPost: {};
  MethodNotSupported: { readonly method: string; readonly path?: string };
  BatchingDisabled: {};
  BatchNeedsPost: {};
  BatchNotArray: {};
  BatchTooLarge: { readonly maxItems: number };
  SubscriptionInBatch: {};
  RouteNotFound: { readonly path: string };
  ContractRouteMissing: { readonly path: string };
  InvalidPathParam: { readonly name: string };
  PathParamsNeedObjectBody: {};

  // Running it
  NotImplemented: { readonly path: string };
  ResponseNeedsHttp: { readonly path: string };
  Aborted: {};
  InvalidOutput: {};
  /** A thrown value that isn't a `TrpcError`. */
  Unexpected: {};

  // Durable calls
  CallIdReused: {};
  InvalidCallId: { readonly header: string };
  InvalidResumeFrom: { readonly header: string };
  StreamedResumeNeedsHttp: {};

  // Socket messages
  InvalidMessage: {};
  UnsupportedProtocolVersion: {
    readonly version: string;
    readonly expected: string;
  };
  DuplicateRequestId: {};
  UnknownMessage: {};
  InvalidConnectionToken: {
    readonly problem:
      | 'missing'
      | 'malformed'
      | 'invalid'
      | 'expired'
      | 'claims';
  };

  // Client links
  FetchFailed: {};
  ConnectionLost: {};
  SubscriptionLost: {};
  LinkClosed: {};
  SerializerMismatch: {
    readonly server: string;
    readonly client: string;
    readonly transport: string;
  };
  UnexpectedStatus: { readonly status: number };
  MissingFrames: {};
  SubscriptionsDisabled: {};
  ResponseValidationFailed: {
    readonly issues: ReadonlyArray<{ readonly message: string }>;
  };
  UndecodableResponse: { readonly part: 'error' | 'event' | 'result' };
  BatchEndedEarly: {};
  UnserializableInput: {};
  LinkFailed: {};
  ChainEnded: {};
  NoTerminatingLink: {};
  UnknownSwitchCase: { readonly name: string; readonly key: string };
  NotInContract: { readonly path: string };

  // Streams
  StreamFailed: {};
  StreamInterrupted: {};
}>;

/** @internal */
export const Reason: Data.TaggedEnum.Constructor<TrpcErrorReason> =
  Data.taggedEnum<TrpcErrorReason>();

type ReasonTag = TrpcErrorReason['_tag'];

/** The reason tagged `K`. @internal */
export type ReasonOf<K extends ReasonTag> = Data.TaggedEnum.Value<
  TrpcErrorReason,
  K
>;

type ReasonMessage<K extends ReasonTag> =
  | string
  | ((reason: ReasonOf<K>, cause: unknown) => string);

const causeMessage = (fallback: string) => (_: unknown, cause: unknown) =>
  cause instanceof Error ? cause.message : fallback;

const TOKEN_PROBLEMS = {
  missing: 'Missing connection token',
  malformed: 'Malformed connection token',
  invalid: 'Invalid connection token',
  expired: 'Expired connection token',
  claims: 'Invalid connection token claims',
} as const;

const RESPONSE_PARTS = {
  error: 'Invalid error message',
  event: 'Invalid event',
  result: 'Invalid result',
} as const;

/** Each reason's code; `null` takes it from the response's status. */
const CODES = {
  BodyTooLarge: 'PAYLOAD_TOO_LARGE',
  BodyUnreadable: 'BAD_REQUEST',
  BodyConsumed: 'INTERNAL_SERVER_ERROR',
  InvalidJson: 'PARSE_ERROR',
  InvalidMultipart: 'PARSE_ERROR',
  InvalidFormBody: 'PARSE_ERROR',
  MultipartWithoutInput: 'BAD_REQUEST',
  UndecodableInput: 'PARSE_ERROR',
  JsonContentTypeRequired: 'UNSUPPORTED_MEDIA_TYPE',
  MultipartWithoutVersionHeader: 'UNSUPPORTED_MEDIA_TYPE',
  UnsupportedBodyType: 'UNSUPPORTED_MEDIA_TYPE',

  ProcedureNotFound: 'NOT_FOUND',
  WrongProcedureType: 'METHOD_NOT_SUPPORTED',
  MutationNeedsPost: 'METHOD_NOT_SUPPORTED',
  MethodNotSupported: 'METHOD_NOT_SUPPORTED',
  BatchingDisabled: 'BAD_REQUEST',
  BatchNeedsPost: 'METHOD_NOT_SUPPORTED',
  BatchNotArray: 'BAD_REQUEST',
  BatchTooLarge: 'PAYLOAD_TOO_LARGE',
  SubscriptionInBatch: 'BAD_REQUEST',
  RouteNotFound: 'NOT_FOUND',
  ContractRouteMissing: 'NOT_FOUND',
  InvalidPathParam: 'BAD_REQUEST',
  PathParamsNeedObjectBody: 'BAD_REQUEST',

  NotImplemented: 'NOT_IMPLEMENTED',
  ResponseNeedsHttp: 'BAD_REQUEST',
  Aborted: 'CLIENT_CLOSED_REQUEST',
  InvalidOutput: 'INTERNAL_SERVER_ERROR',
  Unexpected: 'INTERNAL_SERVER_ERROR',

  CallIdReused: 'CONFLICT',
  InvalidCallId: 'BAD_REQUEST',
  InvalidResumeFrom: 'BAD_REQUEST',
  StreamedResumeNeedsHttp: 'BAD_REQUEST',

  InvalidMessage: 'PARSE_ERROR',
  UnsupportedProtocolVersion: 'UNSUPPORTED_PROTOCOL',
  DuplicateRequestId: 'BAD_REQUEST',
  UnknownMessage: 'BAD_REQUEST',
  InvalidConnectionToken: 'UNAUTHORIZED',

  FetchFailed: 'NETWORK_ERROR',
  ConnectionLost: 'NETWORK_ERROR',
  SubscriptionLost: 'NETWORK_ERROR',
  LinkClosed: 'CLIENT_CLOSED_REQUEST',
  SerializerMismatch: 'UNSUPPORTED_PROTOCOL',
  UnexpectedStatus: null,
  MissingFrames: 'BAD_RESPONSE',
  SubscriptionsDisabled: 'METHOD_NOT_SUPPORTED',
  ResponseValidationFailed: 'BAD_RESPONSE',
  UndecodableResponse: 'BAD_RESPONSE',
  BatchEndedEarly: 'BAD_RESPONSE',
  UnserializableInput: 'BAD_REQUEST',
  LinkFailed: 'CLIENT_ERROR',
  ChainEnded: 'CLIENT_ERROR',
  NoTerminatingLink: 'CLIENT_ERROR',
  UnknownSwitchCase: 'CLIENT_ERROR',
  NotInContract: 'NOT_FOUND',

  StreamFailed: 'INTERNAL_SERVER_ERROR',
  StreamInterrupted: 'STREAM_INTERRUPTED',
} as const;

/** Fails to compile when a reason has no code. */
const codes: { readonly [K in ReasonTag]: BuiltinErrorCode | null } = CODES;

const MESSAGES: { readonly [K in ReasonTag]: ReasonMessage<K> } = {
  BodyTooLarge: 'Request body is too large',
  BodyUnreadable: 'Could not read the request body',
  BodyConsumed:
    'The request body was already read by another middleware. Mount tRPC before body parsers, or use one that sets req.body.',
  InvalidJson: 'Invalid JSON',
  InvalidMultipart: 'Invalid multipart body',
  InvalidFormBody: 'Invalid form body',
  MultipartWithoutInput: 'A multipart body needs an "input" field',
  UndecodableInput: causeMessage('Invalid input'),
  JsonContentTypeRequired:
    'POST requests must have content-type: application/json',
  MultipartWithoutVersionHeader: (r) =>
    `multipart/form-data requests need the ${r.header} header`,
  UnsupportedBodyType:
    'Bodies must be application/json, application/x-www-form-urlencoded or multipart/form-data',

  ProcedureNotFound: (r) => `No procedure at path "${r.path}"`,
  WrongProcedureType: (r) => `"${r.path}" is a ${r.type}, not a ${r.expected}`,
  MutationNeedsPost: 'Mutations must use POST',
  MethodNotSupported: (r) =>
    r.path === undefined
      ? `${r.method} is not supported`
      : `${r.method} is not supported for ${r.path}`,
  BatchingDisabled: 'Batching is not enabled',
  BatchNeedsPost: 'Batches must use POST',
  BatchNotArray: 'A batch body must be an array',
  BatchTooLarge: (r) => `A batch can have at most ${r.maxItems} calls`,
  SubscriptionInBatch: 'Subscriptions cannot be batched',
  RouteNotFound: (r) => `Not found: ${r.path}`,
  ContractRouteMissing: (r) =>
    `The contract's "${r.path}" is not in the router`,
  InvalidPathParam: (r) => `Invalid URL encoding in path param "${r.name}"`,
  PathParamsNeedObjectBody: 'A route with path params needs an object body',

  NotImplemented: (r) =>
    `"${r.path}" is a contract procedure without an implementation`,
  ResponseNeedsHttp: (r) =>
    `"${r.path}" returns a Response, which only an unbatched HTTP call can carry`,
  Aborted: 'The request was aborted',
  InvalidOutput: 'Output validation failed',
  Unexpected: causeMessage('Internal server error'),

  CallIdReused: 'This call id was used with a different input',
  InvalidCallId: (r) =>
    `${r.header} must be 1 to 128 letters, digits, "_", "-", "." or ":"`,
  InvalidResumeFrom: (r) => `${r.header} must be a frame count`,
  StreamedResumeNeedsHttp:
    'A streamed durable call resumes over unbatched HTTP only',

  InvalidMessage: 'Invalid message',
  UnsupportedProtocolVersion: (r) =>
    `Unsupported protocol version "${r.version}", expected "${r.expected}"`,
  DuplicateRequestId: 'Each request needs a unique numeric id',
  UnknownMessage: 'Unknown message',
  InvalidConnectionToken: (r) => TOKEN_PROBLEMS[r.problem],

  FetchFailed: causeMessage('Network error'),
  ConnectionLost: 'The connection was lost',
  SubscriptionLost: 'The subscription connection was lost',
  LinkClosed: 'The link was closed',
  SerializerMismatch: (r) =>
    `The server uses the '${r.server}' serializer, but this ${r.transport} uses '${r.client}'. Pass the same serializer to the handler and ${r.transport}.`,
  UnexpectedStatus: (r) => `Unexpected ${r.status} response`,
  MissingFrames: 'A resumed call answered without frames',
  SubscriptionsDisabled: 'This httpLink has subscriptions turned off',
  ResponseValidationFailed: (r) =>
    `Response validation failed: ${r.issues.map((i) => i.message).join('; ')}`,
  UndecodableResponse: (r) => RESPONSE_PARTS[r.part],
  BatchEndedEarly: 'The batch response ended without a result',
  UnserializableInput: causeMessage('Invalid input'),
  LinkFailed: (_, cause) =>
    cause instanceof Error ? cause.message : String(cause),
  ChainEnded: 'The link chain ended without a result',
  NoTerminatingLink: 'The last link must send the request (e.g. httpLink)',
  UnknownSwitchCase: (r) => `switchLink "${r.name}" has no link "${r.key}"`,
  NotInContract: (r) => `"${r.path}" is not in the contract`,

  StreamFailed: 'Stream failed',
  StreamInterrupted: 'Stream interrupted',
};

type CodeOf<R extends TrpcErrorReason> =
  (typeof CODES)[R['_tag']] extends infer C
    ? C extends string
      ? C
      : BuiltinErrorCode
    : never;

const codeOfResponse = (reason: TrpcErrorReason): BuiltinErrorCode =>
  (Reason.$is('UnexpectedStatus')(reason) && codeOfStatus(reason.status)) ||
  'BAD_RESPONSE';

/**
 * A {@link TrpcError} tRPC made itself, typed by its reason. A union of
 * reasons gives a union of errors, so `Effect.catchTag` on a code narrows
 * the reason too.
 * @internal
 */
export type Failure<R extends TrpcErrorReason = TrpcErrorReason> =
  R extends TrpcErrorReason
    ? TrpcError<CodeOf<R>, undefined> & { readonly reason: R }
    : never;

/**
 * The error for `reason`, with the code and message its spec gives. `cause`
 * is never sent to the client.
 * @internal
 */
export function failure<R extends TrpcErrorReason>(
  reason: R,
  cause?: unknown,
): Failure<R> {
  const message = MESSAGES[reason._tag] as ReasonMessage<R['_tag']>;
  const opts: TrpcErrorOptions<string, undefined> & {
    [REASON]: TrpcErrorReason;
  } = {
    code: codes[reason._tag] ?? codeOfResponse(reason),
    message:
      typeof message === 'function'
        ? message(reason as ReasonOf<R['_tag']>, cause)
        : message,
    cause,
    [REASON]: reason,
  };
  return new TrpcError(opts) as Failure<R>;
}

const isAbort = (cause: unknown) =>
  cause instanceof Error && cause.name === 'AbortError';

/**
 * What a `fetch` rejection fails a call with: itself if it's a
 * {@link TrpcError}, else an abort or a network failure.
 * @internal
 */
export const fetchError = (cause: unknown): AnyTrpcError =>
  isTrpcError(cause)
    ? cause
    : failure(isAbort(cause) ? Reason.Aborted() : Reason.FetchFailed(), cause);

/**
 * What a streamed value rejects with when its stream dies or ends early,
 * for `Serializer.deserializeStream`.
 * @internal
 */
export const streamErrors = {
  streamFailed: (cause: unknown): Failure =>
    failure(Reason.StreamFailed(), cause),
  streamInterrupted: (): Failure => failure(Reason.StreamInterrupted()),
};
