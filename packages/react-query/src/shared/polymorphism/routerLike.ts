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
  TRouter['_def']['record']
>;
export type RouterLikeInner<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyQueryProcedure
      ? QueryLike<TRoot, $Value>
      : $Value extends AnyMutationProcedure
        ? MutationLike<TRoot, $Value>
        : $Value extends RouterRecord
          ? RouterLikeInner<TRoot, $Value>
          : never
    : never;
};

// /**
//  * Use to describe a route path which matches a given route's interface
//  */
// export type RouterLike<TRouter extends AnyRouter> = RouterLikeInner<
//   TRouter['_def']['_config']['$types'],
//   TRouter['_def']['procedures']
// >;
// export type RouterLikeInner<
//   TRoot extends AnyRootTypes,
//   TRecord extends RouterRecord,
// > = DecorateRouterRecord<TRoot, TRecord>;
