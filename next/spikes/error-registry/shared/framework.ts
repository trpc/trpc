/**
 * tRPC's own failures, with no built-in codes: a registry like the app's,
 * that every client's union includes. Today's 25 codes and ~30 server-side
 * tags collapse into what a client can tell apart; the server-only ones
 * (`BatchTooLarge`, `InvalidBody`, …) keep their tags for `onError` and
 * fold into `MalformedRequest` on the wire.
 */
import { Schema } from 'effect';
import { isTrpcError, type AnyTrpcError } from '@trpc12/trpc/server';
import { fromSpecs, type ErrorsOf, type Registry } from './define.ts';

export const trpcFailures = fromSpecs({
  // Made by the server, sent with their tag.
  InvalidInput: {
    status: 400,
    data: Schema.Struct({ issues: Schema.Array(Schema.Unknown) }),
    description: 'The input failed its schema.',
  },
  ProcedureNotFound: {
    status: 404,
    description: 'No procedure at this path: the client is newer than the server.',
  },
  ProcedureTypeMismatch: {
    status: 405,
    description: 'A query called as a mutation, or the other way round.',
  },
  MalformedRequest: {
    status: 400,
    description: 'A request tRPC could not read (a bad body, batch or param).',
  },
  PayloadTooLarge: { status: 413 },
  Internal: {
    status: 500,
    description: 'A crash, its message masked in production.',
  },
  // Made by the client.
  UnknownError: {
    status: 500,
    data: Schema.Struct({ tag: Schema.String }),
    description: "A tag this client's registry lacks: the server is newer.",
  },
  UnexpectedStatus: {
    status: 502,
    data: Schema.Struct({ status: Schema.Number }),
    description: "A response that isn't tRPC's, like a proxy's 401 or 502.",
  },
  NetworkError: { status: 0, retry: true },
  BadResponse: { status: 0 },
  Timeout: { status: 408 },
  Aborted: { status: 499 },
  StreamInterrupted: { status: 0, retry: true },
});

export type TrpcFailures = typeof trpcFailures;
export type TrpcFailure = ErrorsOf<TrpcFailures>;

/**
 * The failures `matchError()` sends to `unexpected` unless a call handles
 * them by name: what a component can't do anything specific about. The
 * rest of the union (the app's registry, `NetworkError`, `BadResponse`)
 * are required keys, as the link codes are today.
 */
export type UnexpectedTag =
  | 'InvalidInput'
  | 'ProcedureNotFound'
  | 'ProcedureTypeMismatch'
  | 'MalformedRequest'
  | 'PayloadTooLarge'
  | 'Internal'
  | 'UnknownError'
  | 'UnexpectedStatus'
  | 'Timeout'
  | 'Aborted'
  | 'StreamInterrupted';

const byTag: Record<string, keyof TrpcFailures> = {
  InvalidInput: 'InvalidInput',
  ProcedureNotFound: 'ProcedureNotFound',
  ProcedureTypeMismatch: 'ProcedureTypeMismatch',
};

const byCode: Record<string, keyof TrpcFailures> = {
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

/** The HTTP statuses v12 gives the built-in codes a proxy's response maps to. */
const statusOfCode: Record<string, number> = {
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

/**
 * Rebuilds what a v12 client received as a registry error: an app error by
 * its tag (rebuilt from `registry`, or by `rebuild`, so `instanceof`
 * holds), or tRPC's own failure for today's built-in codes and tags.
 */
export const decodeWith =
  (registry: Registry, rebuild?: (cause: AnyTrpcError) => unknown) =>
  (cause: unknown): unknown => {
    if (!isTrpcError(cause)) {
      return new trpcFailures.Internal({ message: String(cause), cause });
    }
    const rebuilt = rebuild?.(cause);
    if (rebuilt !== undefined) return rebuilt;
    const own = registry[cause.code] ?? registry[cause._tag];
    if (own) {
      try {
        return own.spec.data === undefined
          ? new own({ message: cause.message, cause })
          : new own(cause.data, { message: cause.message, cause });
      } catch {
        return new trpcFailures.BadResponse({ message: cause.message, cause });
      }
    }
    const failure = byTag[cause._tag] ?? byCode[cause.code];
    if (failure === 'InvalidInput') {
      return new trpcFailures.InvalidInput(
        { issues: (cause.data as { issues?: unknown[] } | undefined)?.issues ?? [] },
        { message: cause.message, cause },
      );
    }
    if (failure) {
      return new trpcFailures[failure]({ message: cause.message, cause } as never);
    }
    const status = statusOfCode[cause.code];
    if (status !== undefined) {
      return new trpcFailures.UnexpectedStatus(
        { status },
        { message: cause.message, cause },
      );
    }
    return new trpcFailures.UnknownError(
      { tag: cause.code },
      { message: cause.message, cause },
    );
  };
