/**
 * Error boundaries over returned errors, for every option with tags (B to
 * G). A boundary claims tags, checked against the errors of what it names
 * with `errorsOf<T>()` (`./sources.ts`): a router, a subrouter, a
 * procedure, a module's declaration or a registry. That's an empty object
 * whose type carries the errors, so a misspelt claim is a type error and
 * the client imports no registry. Its fallback's `error` is the errors it
 * claims. Below it, `query()` and `mutation()` take the owned tags out of
 * a call's union, as today's boundary takes codes out.
 *
 * The runtime is the internal boundary in
 * `packages/tanstack-react-query/src/error-boundary.ts`, as it is: an
 * app error's `code` is its tag, and so is a tRPC failure's
 * (`toFailure()`), so claiming a tag is claiming a code, and
 * `unexpected: true` claims tRPC's unexpected tags by name.
 */
import type {
  InfiniteOptionsOut,
  MutationOptionsOut,
  QueryOptionsOut,
} from '@trpc12/tanstack-query';
import type { AnyProcedure, ProcedureDef } from '@trpc12/trpc/server';
import type { ReactNode } from 'react';
import { createErrorBoundary as createCodeBoundary } from '../../../packages/tanstack-react-query/src/error-boundary.ts';
import {
  unexpectedTags,
  type CallError,
  type UnexpectedTag,
} from '../shared/failures.ts';
import type { ErrorSource } from './sources.ts';

export {
  errorsOf,
  type ErrorsFrom,
  type ErrorSource,
  type ServerErrorsOf,
  type TagOf,
} from './sources.ts';

type Owned<TTags extends string, TUnexpected extends boolean> =
  | TTags
  | (TUnexpected extends true ? UnexpectedTag : never);

/** `E` without what a boundary and the boundaries above it own. */
export type Remaining<
  E,
  TTags extends string,
  TUnexpected extends boolean,
> = Exclude<E, { readonly _tag: Owned<TTags, TUnexpected> }>;

/** What a fallback gets: the errors its boundary claims, by tag. */
export interface FallbackProps<TError> {
  readonly error: TError;
  readonly reset: () => void;
}

declare const owned: unique symbol;

export interface RegistryBoundary<
  TTags extends string,
  TUnexpected extends boolean,
> {
  (props: { readonly children?: ReactNode }): ReactNode;
  /** Type-only: what this boundary and the boundaries above it own. */
  readonly [owned]: {
    readonly tags: TTags;
    readonly unexpected: TUnexpected;
  };
}

export interface RegistryBoundaryOptions<
  TTags extends string,
  TUnexpected extends boolean,
> {
  query<TQueryFnData, TError, TData>(
    options: QueryOptionsOut<TQueryFnData, TError, TData>,
  ): QueryOptionsOut<
    TQueryFnData,
    Remaining<TError, TTags, TUnexpected>,
    TData
  >;
  infiniteQuery<TOutput, TError, TData, TPageParam>(
    options: InfiniteOptionsOut<TOutput, TError, TData, TPageParam>,
  ): InfiniteOptionsOut<
    TOutput,
    Remaining<TError, TTags, TUnexpected>,
    TData,
    TPageParam
  >;
  mutation<TInput, TOutput, TError, TOnMutateResult>(
    options: MutationOptionsOut<TInput, TOutput, TError, TOnMutateResult>,
  ): MutationOptionsOut<
    TInput,
    TOutput,
    Remaining<TError, TTags, TUnexpected>,
    TOnMutateResult
  >;
  owns(error: unknown): boolean;
}

/**
 * A boundary owning `claims`: tags of the errors `errors` names
 * (`errorsOf<AppRouter>()`, `errorsOf<AppRouter['posts']>()`,
 * `errorsOf<typeof postErrors>()`, …) or of tRPC's failures.
 * `unexpected: true` owns tRPC's failures nothing names (`Internal`,
 * `Timeout`, `UnexpectedStatus`, …).
 */
export function createErrorBoundary<
  E,
  const TTags extends CallError<E>['_tag'],
  TUnexpected extends boolean = false,
  TParentTags extends string = never,
  TParentUnexpected extends boolean = false,
>(spec: {
  readonly name: string;
  readonly errors: ErrorSource<E>;
  readonly parent?: RegistryBoundary<TParentTags, TParentUnexpected>;
  readonly claims: ReadonlyArray<TTags>;
  readonly unexpected?: TUnexpected;
  readonly fallback: (
    props: FallbackProps<
      Extract<CallError<E>, { readonly _tag: Owned<TTags, TUnexpected> }>
    >,
  ) => ReactNode;
}): readonly [
  Boundary: RegistryBoundary<
    TTags | TParentTags,
    TUnexpected extends true ? true : TParentUnexpected
  >,
  useBoundary: () => RegistryBoundaryOptions<
    TTags | TParentTags,
    TUnexpected extends true ? true : TParentUnexpected
  >,
] {
  return createCodeBoundary({
    name: spec.name,
    parent: spec.parent as never,
    claims:
      spec.unexpected === true
        ? [...spec.claims, ...unexpectedTags]
        : [...spec.claims],
    fallback: spec.fallback as never,
  }) as never;
}

type Def<P extends AnyProcedure> = NonNullable<P['~trpc']['~types']>;

type ProcedureOptions<
  P extends AnyProcedure,
  D extends ProcedureDef = Def<P>,
> = P['~trpc']['type'] extends 'mutation'
  ? {
      mutationOptions(): MutationOptionsOut<
        D['input'],
        D['output'],
        CallError<D['errors']>,
        unknown
      >;
    }
  : {
      queryOptions(opts: {
        readonly input: D['input'];
      }): QueryOptionsOut<D['output'], CallError<D['errors']>, D['output']>;
    };

/** TanStack options over the client: each call's error is its own. */
export type RegistryQueryUtils<R> = {
  [K in keyof R & string]: R[K] extends AnyProcedure
    ? ProcedureOptions<R[K]>
    : RegistryQueryUtils<R[K]>;
};

type Call = (
  input: unknown,
  opts?: { signal?: AbortSignal },
) => Promise<unknown>;

const at = (client: unknown, path: ReadonlyArray<string>, method: string) =>
  path.reduce<any>((node, key) => node[key], client)[method] as Call;

const utils = (client: unknown, path: ReadonlyArray<string>): unknown =>
  new Proxy(
    {},
    {
      get: (_, key) => {
        if (key === 'queryOptions') {
          return (opts: { input: unknown }) => ({
            queryKey: [path, { input: opts.input, type: 'query' }],
            queryFn: (ctx: { signal: AbortSignal }) =>
              at(client, path, 'query')(opts.input, { signal: ctx.signal }),
          });
        }
        if (key === 'mutationOptions') {
          return () => ({
            mutationKey: [path],
            mutationFn: (input: unknown) => at(client, path, 'mutate')(input),
          });
        }
        return typeof key === 'string'
          ? utils(client, [...path, key])
          : undefined;
      },
    },
  );

/** `createTrpcQueryUtils`'s shape over the client of `R`. */
export const createRegistryQueryUtils = <R>(
  client: unknown,
): RegistryQueryUtils<R> => utils(client, []) as never;
