/**
 * The APIs `.agent-docs/open/error-boundary-claims.md` proposes, as types.
 * A lists codes, as `packages/tanstack-react-query/src/error-boundary.ts`
 * builds. B lists tags. C takes either in one list.
 */
import type {
  QueryKey,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

type Fallback = (props: {
  readonly error: unknown;
  readonly reset: () => void;
}) => ReactNode;

type Boundary = (props: { readonly children?: ReactNode }) => ReactNode;

interface Hooks<TOwned> {
  useQuery<
    TQueryFnData,
    TError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): UseQueryResult<TData, Exclude<TError, TOwned>>;
}

/** A: `claims` lists codes; a code owns every failure with it. */
export declare function createErrorBoundaryA<
  const TCodes extends string,
>(spec: {
  readonly name: string;
  readonly claims: ReadonlyArray<TCodes>;
  readonly fallback: Fallback;
}): readonly [Boundary, () => Hooks<{ readonly code: TCodes }>];

/** B: `claims` lists tags; a tag owns that one failure. */
export declare function createErrorBoundaryB<const TTags extends string>(spec: {
  readonly name: string;
  readonly claims: ReadonlyArray<TTags>;
  readonly fallback: Fallback;
}): readonly [Boundary, () => Hooks<{ readonly _tag: TTags }>];

/** C: `claims` takes codes and tags; built-in codes are `SCREAMING_CASE`, tags `PascalCase`. */
export declare function createErrorBoundaryC<
  const TClaims extends string,
>(spec: {
  readonly name: string;
  readonly claims: ReadonlyArray<TClaims>;
  readonly fallback: Fallback;
}): readonly [
  Boundary,
  () => Hooks<{ readonly code: TClaims } | { readonly _tag: TClaims }>,
];
