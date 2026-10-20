/**
 * The APIs `.agent-docs/open/error-boundary-owned-errors.md` compares, as
 * types. The three options share the built API
 * (`packages/tanstack-react-query/src/error-boundary.ts`); they differ in
 * what an owned error does at runtime: A throws it, B holds a mutation
 * and throws a query's, C holds both.
 */
import type {
  QueryKey,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

type Remaining<E, TCodes extends string, TUnexpected extends boolean> = Exclude<
  Exclude<E, { readonly code: TCodes }>,
  TUnexpected extends true ? { readonly defined: false } : never
>;

declare const owned: unique symbol;

interface ErrorBoundaryComponent<
  TCodes extends string,
  TUnexpected extends boolean,
> {
  (props: { readonly children?: ReactNode }): ReactNode;
  readonly [owned]: {
    readonly codes: TCodes;
    readonly unexpected: TUnexpected;
  };
}

interface Hooks<TCodes extends string, TUnexpected extends boolean> {
  useQuery<
    TQueryFnData,
    TError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): UseQueryResult<TData, Remaining<TError, TCodes, TUnexpected>>;
  useMutation<TData, TError, TVariables, TOnMutateResult>(
    options: UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  ): UseMutationResult<
    TData,
    Remaining<TError, TCodes, TUnexpected>,
    TVariables,
    TOnMutateResult
  >;
  owns(error: unknown): boolean;
}

type CreateErrorBoundary = <
  const TCodes extends string,
  TUnexpected extends boolean = false,
  TParentCodes extends string = never,
  TParentUnexpected extends boolean = false,
>(spec: {
  readonly name: string;
  readonly parent?: ErrorBoundaryComponent<TParentCodes, TParentUnexpected>;
  readonly claims: ReadonlyArray<TCodes>;
  readonly unexpected?: TUnexpected;
  /** A, B, C: `reset` clears the boundary; under B and C it also runs the held calls again. */
  readonly fallback: (props: {
    readonly error: unknown;
    readonly reset: () => void;
  }) => ReactNode;
}) => readonly [
  Boundary: ErrorBoundaryComponent<
    TCodes | TParentCodes,
    TUnexpected extends true ? true : TParentUnexpected
  >,
  useBoundary: () => Hooks<
    TCodes | TParentCodes,
    TUnexpected extends true ? true : TParentUnexpected
  >,
];

/** A: an owned error is thrown, and the fallback replaces the subtree. */
export declare const createErrorBoundaryA: CreateErrorBoundary;
/** B: a query's owned error is thrown; a mutation's is held, with the subtree hidden, not unmounted. */
export declare const createErrorBoundaryB: CreateErrorBoundary;
/** C: queries and mutations both hold. */
export declare const createErrorBoundaryC: CreateErrorBoundary;
