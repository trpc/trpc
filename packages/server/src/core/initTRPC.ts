/* eslint-disable @typescript-eslint/ban-types */
import { createMiddlewareFactory } from './middleware';
import { createBuilder as createProcedure } from './procedure';
import { createRouterWithContext, mergeRouters } from './router';

export function initTRPC<
  TContext,
  TMeta extends Record<string, unknown> = {},
>() {
  return {
    /**
     * Builder object for creating procedures
     */
    procedure: createProcedure<TContext, TMeta>(),
    /**
     * Create reusable middlewares
     */
    middleware: createMiddlewareFactory<TContext, TMeta>(),
    /**
     * Create a router
     */
    router: createRouterWithContext<TContext>(),
    /**
     * Merge Routers
     */
    mergeRouters,
  };
}
