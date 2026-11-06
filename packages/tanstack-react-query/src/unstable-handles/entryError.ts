import { isTRPCClientError } from '@trpc/client';
import type { TRPC_ERROR_CODE_KEY, TRPCError } from '@trpc/server';
import { getTRPCErrorFromUnknown } from '@trpc/server/unstable-core-do-not-import';
import type { ErrorOf, TRPCHandleDef } from './types';

/**
 * What `loadHandles()` rejects with when a fetch or ensure entry fails. It
 * names the entry, and keeps the request's error as `cause`.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#errors-ensure
 */
export class TRPCEntryError<
  TDef extends TRPCHandleDef = TRPCHandleDef,
> extends Error {
  /** The entry's key in the object passed to `loadHandles()` */
  readonly key: string;
  /** The procedure's path, such as `post.byId` */
  readonly path: string;
  /** The tRPC error code, such as `NOT_FOUND`, when the error has one */
  readonly code: TRPC_ERROR_CODE_KEY | undefined;
  // oxlint-disable-next-line typescript/ban-ts-comment
  // @ts-ignore `override` fails where the `lib` has no `Error.cause`
  /**
   * The request's error: a `TRPCError` on a proxy created with `router`, a
   * `TRPCClientError` on one created with `client`.
   */
  public override readonly cause: ErrorOf<TDef> | TRPCError;

  constructor(opts: {
    key: string;
    path: string;
    code: TRPC_ERROR_CODE_KEY | undefined;
    cause: ErrorOf<TDef> | TRPCError;
  }) {
    super(`Entry "${opts.key}" (${opts.path}) failed: ${opts.cause.message}`);
    this.name = 'TRPCEntryError';
    this.cause = opts.cause;
    this.key = opts.key;
    this.path = opts.path;
    this.code = opts.code;
  }
}

function codeOfShape(data: unknown): TRPC_ERROR_CODE_KEY | undefined {
  const code = (data as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? (code as TRPC_ERROR_CODE_KEY) : undefined;
}

export function entryCause(error: unknown) {
  if (isTRPCClientError(error)) {
    return { cause: error, code: codeOfShape(error.data) };
  }
  const cause = getTRPCErrorFromUnknown(error);
  return { cause, code: cause.code };
}
