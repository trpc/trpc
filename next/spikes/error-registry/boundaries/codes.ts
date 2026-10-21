/**
 * Option A's boundary: today's codes, with the same sources as the tagged
 * options (`errorsOf<T>()`). Claims are checked against v12's `ClientError`
 * codes for the source and the fallback's `error` is what they claim; the
 * runtime is the internal boundary as it is, which already owns by `code`.
 *
 * Every built-in code is in every call's `ClientError`, so a source only
 * narrows the custom codes: a boundary over one procedure may claim
 * `PAYMENT_REQUIRED` as well as one over the whole router.
 */
import type { ClientError } from '@trpc12/trpc/client';
import type { ReactNode } from 'react';
import {
  createErrorBoundary as createPortBoundary,
  type ErrorBoundaryComponent,
  type TrpcErrorBoundary,
} from '../../../packages/tanstack-react-query/src/error-boundary.ts';
import type { ErrorSource, ServerErrorsOf } from './sources.ts';

/** A client's errors for `T`, by code: v12's `ClientError`. */
export type CodeErrorsFrom<T> = ClientError<ServerErrorsOf<T>>;

/** Every code a boundary over `T` may claim. */
export type CodeOf<T> = CodeErrorsFrom<T>['code'];

/** What a code boundary's fallback gets. */
export interface CodeFallbackProps<TError> {
  readonly error: TError;
  readonly reset: () => void;
}

export function createCodeErrorBoundary<
  E,
  const TCodes extends ClientError<E>['code'],
  TUnexpected extends boolean = false,
  TParentCodes extends string = never,
  TParentUnexpected extends boolean = false,
>(spec: {
  readonly name: string;
  readonly errors: ErrorSource<E>;
  readonly parent?: ErrorBoundaryComponent<TParentCodes, TParentUnexpected>;
  readonly claims: ReadonlyArray<TCodes>;
  readonly unexpected?: TUnexpected;
  readonly fallback: (
    props: CodeFallbackProps<
      | Extract<ClientError<E>, { readonly code: TCodes }>
      | (TUnexpected extends true
          ? Extract<ClientError<E>, { readonly defined: false }>
          : never)
    >,
  ) => ReactNode;
}): TrpcErrorBoundary<
  TCodes | TParentCodes,
  TUnexpected extends true ? true : TParentUnexpected
> {
  return createPortBoundary({
    name: spec.name,
    parent: spec.parent,
    claims: spec.claims,
    unexpected: spec.unexpected,
    fallback: spec.fallback,
  } as never) as never;
}
