import type { TRPCClientErrorLike } from '@trpc/client';
import { isTRPCClientError } from '@trpc/client';
import type { TRPC_ERROR_CODE_KEY, TRPCError } from '@trpc/server';
import { getTRPCErrorFromUnknown } from '@trpc/server/unstable-core-do-not-import';
import type { ResolverDef } from '../internals/types';

export type ErrorOf<TDef extends ResolverDef> = TRPCClientErrorLike<{
  transformer: TDef['transformer'];
  errorShape: TDef['errorShape'];
}>;

/**
 * What `loadHandles()` rejects with when a fetch or ensure entry fails. It
 * names the entry, and keeps the request's error as `cause`.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#errors-ensure
 */
export class TRPCEntryError<
  TDef extends ResolverDef = ResolverDef,
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

/**
 * The first error in `error`'s `cause` chain with a string `digest`, or `null`.
 * Next.js's `headers()` in a static render, `notFound()` and `redirect()` throw
 * one, and Next reads `digest` off the error the page throws, so a load
 * rethrows it as is rather than hide it in a `TRPCEntryError`.
 */
export function digestErrorOf(error: unknown): Error | null {
  const seen = new Set<Error>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    const { digest, cause } = current as { digest?: unknown; cause?: unknown };
    if (typeof digest === 'string') {
      return current;
    }
    seen.add(current);
    current = cause;
  }
  return null;
}

export function entryCause(error: unknown) {
  if (isTRPCClientError(error)) {
    return { cause: error, code: codeOfShape(error.data) };
  }
  const cause = getTRPCErrorFromUnknown(error);
  return { cause, code: cause.code };
}
