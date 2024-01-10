import type {
  AnyMutationProcedure,
  AnyQueryProcedure,
  AnyRouter,
} from '@trpc/server';
import type { MutationLike } from './mutationLike';
import type { QueryLike } from './queryLike';

/**
 * Use to describe a route path which matches a given route's interface
 */
export type RouterLike<
  TRouter extends AnyRouter,
  TRecord extends TRouter['_def']['record'] = TRouter['_def']['record'],
> = {
  [key in keyof TRecord]: TRecord[key] extends AnyRouter
    ? RouterLike<TRecord[key]>
    : TRecord[key] extends AnyQueryProcedure
    ? QueryLike<TRecord[key]>
    : TRecord[key] extends AnyMutationProcedure
    ? MutationLike<TRecord[key]>
    : never;
};
