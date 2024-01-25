import { createFlatProxy } from './createProxy';
import {
  defaultFormatter,
  type DefaultErrorShape,
  type ErrorFormatter,
  type ErrorFormatterShape,
} from './error/formatter';
import { createMiddlewareFactory } from './middleware';
import { createBuilder } from './procedureBuilder';
import { isServerDefault, type RootConfig } from './rootConfig';
import {
  createCallerFactory,
  createRouterFactory,
  mergeRouters,
} from './router';
import type { DataTransformerOptions } from './transformer';
import { defaultTransformer, getDataTransformer } from './transformer';
import type { PickFirstDefined, Unwrap, ValidateShape } from './types';

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

class TRPCBuilder<TContext extends object, TMeta extends object> {
  /**
   * Add a context shape as a generic to the root object
   * @link https://trpc.io/docs/v11/server/context
   */
  context<TNewContext extends object | ((...args: unknown[]) => object)>() {
    return new TRPCBuilder<Unwrap<TNewContext>, TMeta>();
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
    runtime?:
      | ValidateShape<TOptions, RuntimeConfigOptions<TContext, TMeta>>
      | undefined,
  ) {
    type $Transformer = undefined extends TOptions['transformer']
      ? false
      : true;
    type $ErrorShape = ErrorFormatterShape<
      PickFirstDefined<
        TOptions['errorFormatter'],
        ErrorFormatter<TContext, DefaultErrorShape>
      >
    >;

    type $Config = RootConfig<{
      ctx: TContext;
      meta: TMeta;
      errorShape: $ErrorShape;
      transformer: $Transformer;
    }>;

    const errorFormatter = runtime?.errorFormatter ?? defaultFormatter;
    const transformer = getDataTransformer(
      runtime?.transformer ?? defaultTransformer,
    );

    const config: $Config = {
      transformer,
      isDev:
        runtime?.isDev ??
        // eslint-disable-next-line @typescript-eslint/dot-notation
        globalThis.process?.env?.['NODE_ENV'] !== 'production',
      allowOutsideOfServer: runtime?.allowOutsideOfServer ?? false,
      errorFormatter,
      isServer: runtime?.isServer ?? isServerDefault,
      /**
       * @internal
       */
      $types: createFlatProxy((key) => {
        throw new Error(
          `Tried to access "$types.${key}" which is not available at runtime`,
        );
      }),
    };

    {
      // Server check
      const isServer: boolean = runtime?.isServer ?? isServerDefault;

      if (!isServer && runtime?.allowOutsideOfServer !== true) {
        throw new Error(
          `You're trying to use @trpc/server in a non-server environment. This is not supported by default.`,
        );
      }
    }
    return {
      /**
       * These are just types, they can't be used
       * @internal
       */
      _config: config,
      /**
       * Builder object for creating procedures
       * @link https://trpc.io/docs/v11/server/procedures
       */
      procedure: createBuilder<
        $Config['$types']['ctx'],
        $Config['$types']['meta']
      >({
        meta: runtime?.defaultMeta,
      }),
      /**
       * Create reusable middlewares
       * @link https://trpc.io/docs/v11/server/middlewares
       */
      middleware: createMiddlewareFactory<
        $Config['$types']['ctx'],
        $Config['$types']['meta']
      >(),
      /**
       * Create a router
       * @link https://trpc.io/docs/v11/server/routers
       */
      router: createRouterFactory<$Config>(config),
      /**
       * Merge Routers
       * @link https://trpc.io/docs/v11/server/merging-routers
       */
      mergeRouters,
      /**
       * Create a server-side caller for a router
       * @link https://trpc.io/docs/v11/server/server-side-calls
       */
      createCallerFactory: createCallerFactory<$Config>(),
    };
  }
}

/**
 * Builder to initialize the tRPC root object - use this exactly once per backend
 * @link https://trpc.io/docs/v11/quickstart
 */
export const initTRPC = new TRPCBuilder();
