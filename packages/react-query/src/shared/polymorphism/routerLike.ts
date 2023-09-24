import { AnyRouter } from '@trpc/server';
import { DecoratedProcedureRecord } from '../../createTRPCReact';

/**
 * Use to describe a route path which matches a given route's interface
 */
export type RouterLike<TRouter extends AnyRouter> = DecoratedProcedureRecord<
  TRouter['_def']['_config'],
  TRouter['_def']['procedures'],
  any
>;

// export type RouterLike<TRouter extends AnyRouter> = TRouter extends Router<
//   infer TRouterDef
// >
//   ? TRouterDef extends RouterDef<infer TConfig, infer TProcedures>
//     ? DecoratedProcedureRecord<TConfig, TProcedures, any>
//     : never
//   : never;
