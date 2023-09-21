import {
  AnyMutationProcedure,
  AnyQueryProcedure,
  AnyRouter,
  Router,
} from '@trpc/server';
import { MutationLike } from './mutationLike';
import { QueryLike } from './queryLike';

/**
 * Use to describe a route path which matches a given route's interface
 */
export type RouterLike<
  TRouter extends AnyRouter,
  TRecord extends TRouter['_def']['record'] = TRouter['_def']['record'],
> = TRouter extends Router<infer TDef>
  ? {
      [key in keyof TRecord]: TRecord[key] extends AnyRouter
        ? RouterLike<TRecord[key]>
        : TRecord[key] extends AnyQueryProcedure
        ? QueryLike<TDef['_config'], TRecord[key]>
        : TRecord[key] extends AnyMutationProcedure
        ? MutationLike<TDef['_config'], TRecord[key]>
        : never;
    }
  : never;
