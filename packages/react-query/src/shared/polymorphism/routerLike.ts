import type {
  AnyMutationProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  RouterRecord,
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
  TProcedures extends RouterRecord,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends infer TItem
    ? TItem extends RouterRecord
      ? RouterLikeInner<TRoot, TItem>
      : TItem extends AnyQueryProcedure
      ? QueryLike<TRoot, TItem>
      : TItem extends AnyMutationProcedure
      ? MutationLike<TRoot, TItem>
      : never
    : never;
};
