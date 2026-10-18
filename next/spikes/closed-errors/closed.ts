import { Stream } from 'effect';
import {
  ERROR_STATUS,
  link,
  safe,
  TrpcError,
  type AnyTrpcError,
  type BuiltinErrorCode,
  type SafeResult,
  type UnexpectedError,
} from '@trpc12/trpc/client';

/**
 * One `defined: false` error per built-in code: everything a call can fail
 * with outside its procedure's union, once off-list codes are folded into
 * `INTERNAL_SERVER_ERROR` ({@link closedLink}).
 */
export type BoundaryError = {
  [C in BuiltinErrorCode]: TrpcError<C, unknown> & { readonly defined: false };
}[BuiltinErrorCode];

/** A call's error with the open `UnexpectedError` bucket replaced by {@link BoundaryError}. */
export type Closed<E> = Exclude<E, UnexpectedError> | BoundaryError;

/** The error a call's promise carries for `safe()`. */
export type ErrorOf<P> = P extends { readonly '~error'?: infer E } ? E : never;

const builtin = new Set<string>(Object.keys(ERROR_STATUS));

/** Keeps defined errors and built-in codes; anything else becomes `INTERNAL_SERVER_ERROR`. */
export const close = (err: AnyTrpcError): AnyTrpcError =>
  err.defined || builtin.has(err.code)
    ? err
    : new TrpcError({
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message,
        cause: err,
      });

/** Makes the runtime match {@link Closed}: put it first in `links`. */
export const closedLink = () =>
  link(({ op, next }) => next(op).pipe(Stream.mapError(close)));

/** `safe()` typed with the closed union. Needs {@link closedLink} in the chain. */
export const safeClosed = <P extends PromiseLike<unknown>>(
  promise: P,
): Promise<SafeResult<Awaited<P>, Closed<ErrorOf<P>>>> =>
  safe(promise) as Promise<SafeResult<Awaited<P>, Closed<ErrorOf<P>>>>;

type DefinedOf<E> = Extract<E, { readonly defined: true }>;
type UndefinedOf<E> = Exclude<E, { readonly defined: true }>;
type CodeOf<E> = E extends { readonly code: infer C extends string }
  ? C
  : never;

/**
 * A handler per defined code, all required, plus `unexpected` for the
 * `defined: false` rest. `unexpected` is gone once nothing undefined is
 * left (a shell above owns it).
 */
export type ErrorHandlers<E, R> = {
  [C in CodeOf<DefinedOf<E>>]: (
    err: Extract<DefinedOf<E>, { readonly code: C }>,
  ) => R;
} & ([UndefinedOf<E>] extends [never]
  ? { unexpected?: never }
  : { unexpected: (err: UndefinedOf<E>) => R });

type HandlerResult<H> = {
  [K in keyof H]-?: H[K] extends (err: never) => infer R ? R : never;
}[keyof H];

export function matchError<
  E extends AnyTrpcError,
  H extends ErrorHandlers<E, unknown>,
>(err: E, handlers: H): HandlerResult<H> {
  const table = handlers as Record<
    string,
    ((err: E) => HandlerResult<H>) | undefined
  >;
  const handler = err.defined ? table[err.code] : table['unexpected'];
  if (!handler) throw err;
  return handler(err);
}
