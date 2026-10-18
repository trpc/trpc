import { Stream } from 'effect';
import {
  ERROR_STATUS,
  link,
  safe,
  TrpcError,
  type AnyTrpcError,
  type BuiltinError,
  type SafeResult,
} from '@trpc12/trpc/client';

export { matchError } from '@trpc12/trpc/client';

/**
 * One `defined: false` error per built-in code. Shipped as `BuiltinError`
 * in `@trpc12/trpc/client`, with `data: undefined`.
 */
export type BoundaryError = BuiltinError;

/** The client's union is closed now, so this changes nothing. */
export type Closed<E> = E;

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

/** What the spike put first in `links`. The server and `runLinks` do it now. */
export const closedLink = () =>
  link(({ op, next }) => next(op).pipe(Stream.mapError(close)));

/** `safe()` typed with the closed union. */
export const safeClosed = <P extends PromiseLike<unknown>>(
  promise: P,
): Promise<SafeResult<Awaited<P>, Closed<ErrorOf<P>>>> =>
  safe(promise) as Promise<SafeResult<Awaited<P>, Closed<ErrorOf<P>>>>;
