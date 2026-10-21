/**
 * tRPC's own failures as the client sees them, with no built-in codes:
 * today's 25 codes and ~30 server-side tags collapse into what a client
 * can tell apart. Client code: it imports nothing from a registry and
 * nothing that isn't in v12's client already, so a client bundle carries
 * this mapping (a fixed size) and none of the app's errors.
 */
import {
  isBuiltinCode,
  isTrpcError,
  TrpcError,
  type BuiltinErrorCode,
} from '@trpc12/trpc/client';

/**
 * An error as a call's union names it: its `_tag` and `data`. The value
 * is v12's `TrpcError`, whose `code` is the tag; under the proposal `code`
 * goes and `_tag` is the error's only name.
 */
export interface RegistryError<TTag extends string, TData = undefined>
  extends Error {
  readonly _tag: TTag;
  readonly data: TData;
}

/** tRPC's own failures, in every call's union. */
export type TrpcFailure =
  // Made by the server, sent with their tag.
  /** The input failed its schema. */
  | RegistryError<'InvalidInput', { readonly issues: ReadonlyArray<unknown> }>
  /** No procedure at this path: the client is newer than the server. */
  | RegistryError<'ProcedureNotFound'>
  /** A query called as a mutation, or the other way round. */
  | RegistryError<'ProcedureTypeMismatch'>
  /** A request tRPC could not read (a bad body, batch, param or transformer). */
  | RegistryError<'MalformedRequest'>
  | RegistryError<'PayloadTooLarge'>
  /** A crash, or an error thrown rather than returned. Masked in production. */
  | RegistryError<'Internal'>
  // Made by the client.
  /** A response that isn't tRPC's, like a proxy's 401 or 502. */
  | RegistryError<'UnexpectedStatus', { readonly status: number }>
  | RegistryError<'NetworkError'>
  | RegistryError<'BadResponse'>
  | RegistryError<'Timeout'>
  | RegistryError<'Aborted'>
  | RegistryError<'StreamInterrupted'>;

/**
 * The failures `matchError()` sends to `unexpected` unless a call handles
 * them by name: what a component can't do anything specific about. The
 * rest of the union (the call's own errors, `NetworkError`, `BadResponse`)
 * are required keys, as the link codes are today.
 */
export type UnexpectedTag =
  | 'InvalidInput'
  | 'ProcedureNotFound'
  | 'ProcedureTypeMismatch'
  | 'MalformedRequest'
  | 'PayloadTooLarge'
  | 'Internal'
  | 'UnexpectedStatus'
  | 'Timeout'
  | 'Aborted'
  | 'StreamInterrupted';

/** {@link UnexpectedTag} at runtime, for a boundary's `unexpected`. */
export const unexpectedTags: ReadonlyArray<UnexpectedTag> = [
  'InvalidInput',
  'ProcedureNotFound',
  'ProcedureTypeMismatch',
  'MalformedRequest',
  'PayloadTooLarge',
  'Internal',
  'UnexpectedStatus',
  'Timeout',
  'Aborted',
  'StreamInterrupted',
];

/**
 * A procedure's errors (v12's `inferProcedureErrors`) as a call's union
 * names them. v12's own members go: a `BAD_REQUEST` typing the input's
 * issues is `InvalidInput` in {@link TrpcFailure}.
 */
export type ClientErrorOf<E> = E extends {
  readonly code: infer C;
  readonly _tag: infer T extends string;
  readonly data: infer D;
}
  ? C extends BuiltinErrorCode
    ? never
    : RegistryError<T, D>
  : never;

/** What a call to a procedure whose errors are `E` can fail with. */
export type CallError<E> = ClientErrorOf<E> | TrpcFailure;

const byTag: Record<string, TrpcFailure['_tag']> = {
  ProcedureNotFound: 'ProcedureNotFound',
  ProcedureTypeMismatch: 'ProcedureTypeMismatch',
  TransformerMismatch: 'MalformedRequest',
};

const byCode: Partial<Record<BuiltinErrorCode, TrpcFailure['_tag']>> = {
  PARSE_ERROR: 'MalformedRequest',
  BAD_REQUEST: 'MalformedRequest',
  METHOD_NOT_SUPPORTED: 'ProcedureTypeMismatch',
  UNSUPPORTED_MEDIA_TYPE: 'MalformedRequest',
  PAYLOAD_TOO_LARGE: 'PayloadTooLarge',
  INTERNAL_SERVER_ERROR: 'Internal',
  NETWORK_ERROR: 'NetworkError',
  BAD_RESPONSE: 'BadResponse',
  CLIENT_ERROR: 'BadResponse',
  TIMEOUT: 'Timeout',
  CLIENT_CLOSED_REQUEST: 'Aborted',
  STREAM_INTERRUPTED: 'StreamInterrupted',
};

/** The statuses v12 gives the built-in codes a proxy's response maps to. */
const statusOfCode: Partial<Record<BuiltinErrorCode, number>> = {
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

const fail = (
  tag: TrpcFailure['_tag'],
  cause: unknown,
  message: string,
  data?: unknown,
) =>
  new TrpcError({ code: tag, tag, message, data, cause, defined: false });

/**
 * What a v12 client rejected with, as a call's union names it. An error a
 * resolver or middleware returned (`defined`) is the app's and stays as it
 * is: the client knows no registry, so it has nothing to rebuild. A thrown
 * one is `Internal`, like a crash, and v12's built-in codes become tRPC's
 * failures; any other status a proxy answered with is `UnexpectedStatus`.
 */
export function toFailure(cause: unknown): unknown {
  if (!isTrpcError(cause)) return fail('Internal', cause, String(cause));
  if (!isBuiltinCode(cause.code)) {
    return cause.defined ? cause : fail('Internal', cause, cause.message);
  }
  const issues = (cause.data as { issues?: unknown } | undefined)?.issues;
  if (cause.code === 'BAD_REQUEST' && Array.isArray(issues)) {
    return fail('InvalidInput', cause, cause.message, { issues });
  }
  const tag = byTag[cause._tag] ?? byCode[cause.code];
  if (tag) return fail(tag, cause, cause.message);
  return fail('UnexpectedStatus', cause, cause.message, {
    status: statusOfCode[cause.code] ?? 500,
  });
}
