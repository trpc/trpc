import { createReactQueryHooks } from '@trpc/react';
import type {
  inferProcedureOutput,
  inferProcedureInput,
  ProcedureRecord,
  Prefixer,
} from '@trpc/server';
// ℹ️ Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter } from 'server/routers/_app';

/**
 * A set of strongly-typed React hooks from your `AppRouter` type signature with `createReactQueryHooks`.
 * @link https://trpc.io/docs/react#3-create-trpc-hooks
 */
export const trpc = createReactQueryHooks<AppRouter>();

// -------------- option 1 --------------
type inferProcedures<TObj extends ProcedureRecord<any, any, any, any>> = {
  [TPath in keyof TObj]: {
    input: inferProcedureInput<TObj[TPath]>;
    output: inferProcedureOutput<TObj[TPath]>;
  };
};
/**
 * @example usage:
 * function PostListItem(props: TQueries['post.byId']['output']) {
 *   return <pre>{JSON.stringify(props, null, 4)}</pre>;
 * }
 */
export type TQueries = inferProcedures<AppRouter['_def']['queries']>;
export type TMutations = inferProcedures<AppRouter['_def']['mutations']>;

// -------------- option 2 --------------
type inferProcedureInputs<TObj extends ProcedureRecord<any, any, any, any>> = {
  [TPath in keyof TObj]: inferProcedureInput<TObj[TPath]>;
};
type inferProcedureOutputs<TObj extends ProcedureRecord<any, any, any, any>> = {
  [TPath in keyof TObj]: inferProcedureOutput<TObj[TPath]>;
};

/**
 * @example usage:
 * function PostListItem(props: TQueryOutputs['post.byId']) {
 *   return <pre>{JSON.stringify(props, null, 4)}</pre>;
 * }
 */
export type TQueryOutputs = inferProcedureOutputs<AppRouter['_def']['queries']>;
export type TQueryInputs = inferProcedureInputs<AppRouter['_def']['mutations']>;

// -------------- option 4 --------------

export type flat<T> = {
  [k in keyof T]: T[k];
};

type inferFlat<TObj extends ProcedureRecord<any, any, any, any>> = flat<
  {
    [TPath in keyof TObj as `${string & TPath}.input`]: inferProcedureInput<
      TObj[TPath]
    >;
  } & {
    [TPath in keyof TObj as `${string & TPath}.output`]: inferProcedureOutput<
      TObj[TPath]
    >;
  }
>;

type TFlat = flat<
  Prefixer<inferFlat<AppRouter['_def']['queries']>, 'query'> &
    Prefixer<inferFlat<AppRouter['_def']['mutations']>, 'mutation'> &
    Prefixer<inferFlat<AppRouter['_def']['subscriptions']>, 'subscription'>
>;
