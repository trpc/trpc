/* eslint-disable @typescript-eslint/ban-types */
import { defaultFormatter } from '../error/formatter';
import { ValidateShape } from './internals/utils';
import { createMiddlewareFactory } from './middleware';
import { createBuilder as createProcedure } from './procedure';
import {
  RouterDefaultOptions,
  createRouterWithContext,
  defaultTransformer,
  mergeRouters,
} from './router';

export function initTRPC<
  TParams extends {
    ctx?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  },
>() {
  type $Context = TParams['ctx'] extends undefined ? {} : TParams['ctx'];
  type $Meta = TParams['meta'] extends undefined ? {} : TParams['meta'];
  // type $Params = {
  //   ctx: $Context;
  //   meta: $Meta;
  // };
  type DefaultOptions = RouterDefaultOptions<$Context>;
  return function initTRPCInner<TDefaults extends DefaultOptions>(
    defaults?: ValidateShape<TDefaults, DefaultOptions>,
  ) {
    return {
      /**
       * Builder object for creating procedures
       */
      procedure: createProcedure<$Context, $Meta>(),
      /**
       * Create reusable middlewares
       */
      middleware: createMiddlewareFactory<$Context, $Meta>(),
      /**
       * Create a router
       * FIXME this should also use error formatter
       */
      router: createRouterWithContext<$Context>({
        errorFormatter: defaults?.errorFormatter || defaultFormatter,
        transformer: defaults?.transformer || defaultTransformer,
      }),
      /**
       * Merge Routers
       */
      mergeRouters,
    };
  };
}
