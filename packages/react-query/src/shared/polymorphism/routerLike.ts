import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootConfig,
  AnyRouter,
} from '@trpc/server';
import { MutationLike } from './mutationLike';
import { QueryLike } from './queryLike';

/**
 * Use to describe a route path which matches a given route's interface
 */
export type RouterLike<TRouter extends AnyRouter> = RouterLikeInner<
  TRouter['_def']['_config'],
  TRouter['_def']['procedures']
>;
export type RouterLikeInner<
  TConfig extends AnyRootConfig,
  TProcedures extends AnyProcedure,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? RouterLikeInner<TConfig, TProcedures[TKey]['_def']['record']>
    : TProcedures[TKey] extends AnyQueryProcedure
    ? QueryLike<TConfig, TProcedures[TKey]>
    : TProcedures[TKey] extends AnyMutationProcedure
    ? MutationLike<TConfig, TProcedures[TKey]>
    : never;
};
