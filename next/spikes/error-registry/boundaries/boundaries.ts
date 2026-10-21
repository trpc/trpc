/**
 * Error boundaries over a registry (option E; B is its one-module case).
 * A boundary claims tags, checked against the registry it's given, so a
 * misspelt claim is a type error, and its fallback's `error` is the
 * errors it claims. Below it, `query()` and `mutation()` take the owned
 * tags out of a call's union, as today's boundary takes codes out.
 *
 * The runtime is the internal boundary in
 * `packages/tanstack-react-query/src/error-boundary.ts`, as it is: a
 * registry error's `code` is its tag, so claiming a tag is claiming a
 * code, and `unexpected: true` claims tRPC's unexpected tags by name.
 */
import type {
  InfiniteOptionsOut,
  MutationOptionsOut,
  QueryOptionsOut,
} from '@trpc12/tanstack-query';
import type { AnyProcedure } from '@trpc12/trpc/server';
import type { ReactNode } from 'react';
import { createErrorBoundary as createCodeBoundary } from '../../../packages/tanstack-react-query/src/error-boundary.ts';
import type { ErrorsOfRouter, ScopeOf } from '../shared/client.ts';
import type { ErrorsOf, Registry } from '../shared/define.ts';
import {
  trpcFailures,
  type TrpcFailure,
  type UnexpectedTag,
} from '../shared/framework.ts';

/** Every tag a client of the registry `R` can see: the app's and tRPC's. */
export type TagOf<R> = (keyof R & string) | TrpcFailure['_tag'];

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

const unexpectedTags = Object.keys(trpcFailures).filter(
  (tag) => tag !== 'NetworkError' && tag !== 'BadResponse',
);

/**
 * A boundary owning `claims`, tags of `errors` (the merged registry, or
 * one module's) or of tRPC's failures; `unexpected: true` owns tRPC's
 * failures nothing names (`Internal`, `Timeout`, `UnknownError`, …).
 */
export function createErrorBoundary<
  const R extends Registry,
  const TTags extends TagOf<R>,
  TUnexpected extends boolean = false,
  TParentTags extends string = never,
  TParentUnexpected extends boolean = false,
>(spec: {
  readonly name: string;
  readonly errors: R;
  readonly parent?: RegistryBoundary<TParentTags, TParentUnexpected>;
  readonly claims: ReadonlyArray<TTags>;
  readonly unexpected?: TUnexpected;
  readonly fallback: (
    props: FallbackProps<
      Extract<
        ErrorsOf<R> | TrpcFailure,
        { readonly _tag: Owned<TTags, TUnexpected> }
      >
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
  D extends { type: string; input: any; output: any },
  E,
> = D['type'] extends 'mutation'
  ? {
      mutationOptions(): MutationOptionsOut<
        D['input'],
        D['output'],
        E,
        unknown
      >;
    }
  : {
      queryOptions(opts: {
        readonly input: D['input'];
      }): QueryOptionsOut<D['output'], E, D['output']>;
    };

/** TanStack options over a registry client: each call's error is its scope's. */
export type RegistryQueryUtils<R, E> = {
  [K in keyof R & string]: R[K] extends AnyProcedure
    ? ProcedureOptions<Def<R[K]>, E>
    : RegistryQueryUtils<R[K], ScopeOf<R[K], E>>;
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

/** `createTrpcQueryUtils`'s shape over a registry client of `R`. */
export const createRegistryQueryUtils = <R>(
  client: unknown,
): RegistryQueryUtils<R, ErrorsOfRouter<R>> => utils(client, []) as never;
