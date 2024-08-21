import {
  defaultFormatter,
  type DefaultErrorShape,
  type ErrorFormatter,
} from './error/formatter';
import { createMiddlewareFactory } from './middleware';
import { createBuilder } from './procedureBuilder';
import type { CreateRootTypes } from './rootConfig';
import { isServerDefault, type RootConfig } from './rootConfig';
import {
  createCallerFactory,
  createRouterFactory,
  mergeRouters,
} from './router';
import type { DataTransformerOptions } from './transformer';
import { defaultTransformer, getDataTransformer } from './transformer';
import type { Unwrap, ValidateShape } from './types';

type inferErrorFormatterShape<TType> = TType extends ErrorFormatter<
  any,
  infer TShape
>
  ? TShape
  : DefaultErrorShape;
interface RuntimeConfigOptions<TContext extends object, TMeta extends object>
  extends Partial<
    Omit<
      RootConfig<{
        ctx: TContext;
        meta: TMeta;
        errorShape: any;
        transformer: any;
      }>,
      '$types' | 'transformer'
    >
  > {
  /**
   * Use a data transformer
   * @link https://trpc.io/docs/v11/data-transformers
   */
  transformer?: DataTransformerOptions;
}

type ContextCallback = (...args: any[]) => object | Promise<object>;

class TRPCBuilder<TContext extends object, TMeta extends object> {
  /**
   * Add a context shape as a generic to the root object
   * @link https://trpc.io/docs/v11/server/context
   */
  context<TNewContext extends object | ContextCallback>() {
    return new TRPCBuilder<
      TNewContext extends ContextCallback ? Unwrap<TNewContext> : TNewContext,
      TMeta
    >();
  }

  /**
   * Add a meta shape as a generic to the root object
   * @link https://trpc.io/docs/v11/quickstart
   */
  meta<TNewMeta extends object>() {
    return new TRPCBuilder<TContext, TNewMeta>();
  }

  /**
   * Create the root object
   * @link https://trpc.io/docs/v11/server/routers#initialize-trpc
   */
  create<TOptions extends RuntimeConfigOptions<TContext, TMeta>>(
    opts?:
      | ValidateShape<TOptions, RuntimeConfigOptions<TContext, TMeta>>
      | undefined,
  ) {
    type $Root = CreateRootTypes<{
      ctx: TContext;
      meta: TMeta;
      errorShape: undefined extends TOptions['errorFormatter']
        ? DefaultErrorShape
        : inferErrorFormatterShape<TOptions['errorFormatter']>;
      transformer: undefined extends TOptions['transformer'] ? false : true;
    }>;

    const config: RootConfig<$Root> = {
      transformer: getDataTransformer(opts?.transformer ?? defaultTransformer),
      isDev:
        opts?.isDev ??
        // eslint-disable-next-line @typescript-eslint/dot-notation
        globalThis.process?.env['NODE_ENV'] !== 'production',
      allowOutsideOfServer: opts?.allowOutsideOfServer ?? false,
      errorFormatter: opts?.errorFormatter ?? defaultFormatter,
      isServer: opts?.isServer ?? isServerDefault,
      /**
       * These are just types, they can't be used at runtime
       * @internal
       */
      $types: null as any,
      experimental: opts?.experimental ?? {},
    };

    {
      // Server check
      const isServer: boolean = opts?.isServer ?? isServerDefault;

      if (!isServer && opts?.allowOutsideOfServer !== true) {
        throw new Error(
          `You're trying to use @trpc/server in a non-server environment. This is not supported by default.`,
        );
      }
    }
    return {
      /**
       * Your router config
       * @internal
       */
      _config: config,
      /**
       * Builder object for creating procedures
       * @link https://trpc.io/docs/v11/server/procedures
       */
      procedure: createBuilder<$Root['ctx'], $Root['meta']>({
        meta: opts?.defaultMeta,
      }),
      /**
       * Create reusable middlewares
       * @link https://trpc.io/docs/v11/server/middlewares
       */
      middleware: createMiddlewareFactory<$Root['ctx'], $Root['meta']>(),
      /**
       * Create a router
       * @link https://trpc.io/docs/v11/server/routers
       */
      router: createRouterFactory<$Root>(config),
      /**
       * Merge Routers
       * @link https://trpc.io/docs/v11/server/merging-routers
       */
      mergeRouters,
      /**
       * Create a server-side caller for a router
       * @link https://trpc.io/docs/v11/server/server-side-calls
       */
      createCallerFactory: createCallerFactory<$Root>(),
    };
  }
}

/**
 * Builder to initialize the tRPC root object - use this exactly once per backend
 * @link https://trpc.io/docs/v11/quickstart
 */
export const initTRPC = new TRPCBuilder();
export type { TRPCBuilder };
