import { CreateTRPCReact } from '@trpc/react-query/createTRPCReact';
import { AnyRouter } from '@trpc/server';

/**
 * Use to describe a route path which matches a given route's interface
 */
export type RouterLike<TRouter extends AnyRouter> = CreateTRPCReact<
  TRouter,
  any,
  any
>;
