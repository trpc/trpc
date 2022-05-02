/* eslint-disable @typescript-eslint/ban-types */
import { ValidateShape } from './internals/utils';
import { createMiddlewareFactory } from './middleware';
import { createBuilder as createProcedure } from './procedure';
import {
  RouterDefaultOptions,
  createRouterWithContext,
  mergeRouters,
} from './router';

export function initTRPC<
  TContext,
  TMeta extends Record<string, unknown> = {},
>() {
  type DefaultOptions = RouterDefaultOptions<TContext>;
  return function initTRPCInner<TDefaults extends DefaultOptions>(
    defaults?: ValidateShape<TDefaults, DefaultOptions>,
  ) {
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
       * FIXME this should also use error formatter
       */
      router: createRouterWithContext<TContext>(defaults),
      /**
       * Merge Routers
       */
      mergeRouters,
    };
  };
}
