import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
} from '@trpc/server/unstable-core-do-not-import';
import type { MutationLike } from './mutationLike';
import type { QueryLike } from './queryLike';

/**
 * Use to describe a route path which matches a given route's interface
 */
export type RouterLike<TRouter extends AnyRouter> = RouterLikeInner<
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['procedures']
>;
export type RouterLikeInner<
  TRoot extends AnyRootTypes,
  TProcedures extends AnyProcedure,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? RouterLikeInner<TRoot, TProcedures[TKey]['_def']['record']>
    : TProcedures[TKey] extends AnyQueryProcedure
    ? QueryLike<TRoot, TProcedures[TKey]>
    : TProcedures[TKey] extends AnyMutationProcedure
    ? MutationLike<TRoot, TProcedures[TKey]>
    : never;
};
