import { createFlatProxy } from './createProxy';
import {
  defaultFormatter,
  type DefaultErrorShape,
  type ErrorFormatter,
  type ErrorFormatterShape,
} from './error/formatter';
import { createMiddlewareFactory } from './middleware';
import { createBuilder } from './procedureBuilder';
import {
  isServerDefault,
  type CreateRootConfigTypes,
  type RootConfig,
  type RootConfigTypes,
  type RuntimeConfig,
} from './rootConfig';
import {
  createCallerFactory,
  createRouterFactory,
  mergeRouters,
} from './router';
import {
  defaultTransformer,
  getDataTransformer,
  type DataTransformerOptions,
  type DefaultDataTransformer,
} from './transformer';
import type {
  Overwrite,
  PickFirstDefined,
  Unwrap,
  ValidateShape,
} from './types';

type PartialRootConfigTypes = Partial<RootConfigTypes>;

type CreateRootConfigTypesFromPartial<TTypes extends PartialRootConfigTypes> =
  CreateRootConfigTypes<{
    ctx: TTypes['ctx'] extends RootConfigTypes['ctx'] ? TTypes['ctx'] : object;
    meta: TTypes['meta'] extends RootConfigTypes['meta']
      ? TTypes['meta']
      : object;
    errorShape: TTypes['errorShape'];
    transformer: DataTransformerOptions;
  }>;

/**
 * TODO: This can be improved:
 * - We should be able to chain `.meta()`/`.context()` only once
 * - Simplify typings
 * - Doesn't need to be a class but it doesn't really hurt either
 */

class TRPCBuilder<TParams extends PartialRootConfigTypes = object> {
  /**
   * Add a context shape as a generic to the root object
   * @link https://trpc.io/docs/v11/server/context
   */
  context<
    TNewContext extends
      | RootConfigTypes['ctx']
      | ((...args: unknown[]) => RootConfigTypes['ctx']),
  >() {
    type NextParams = Overwrite<TParams, { ctx: Unwrap<TNewContext> }>;

    return new TRPCBuilder<NextParams>();
  }

  /**
   * Add a meta shape as a generic to the root object
   * @link https://trpc.io/docs/v11/quickstart
   */
  meta<TNewMeta extends RootConfigTypes['meta']>() {
    type NextParams = Overwrite<TParams, { meta: TNewMeta }>;

    return new TRPCBuilder<NextParams>();
  }

  /**
   * Create the root object
   * @link https://trpc.io/docs/v11/server/routers#initialize-trpc
   */
  create<
    TOptions extends Partial<
      RuntimeConfig<CreateRootConfigTypesFromPartial<TParams>>
    >,
  >(
    options?:
      | ValidateShape<
          TOptions,
          Partial<RuntimeConfig<CreateRootConfigTypesFromPartial<TParams>>>
        >
      | undefined,
  ) {
    return createTRPCInner<TParams>()<TOptions>(options);
  }
}

/**
 * Builder to initialize the tRPC root object - use this exactly once per backend
 * @link https://trpc.io/docs/v11/quickstart
 */
export const initTRPC = new TRPCBuilder();

function createTRPCInner<TParams extends PartialRootConfigTypes>() {
  type $Generics = CreateRootConfigTypesFromPartial<TParams>;

  type $Context = $Generics['ctx'];
  type $Meta = $Generics['meta'];
  type $Runtime = Partial<RuntimeConfig<$Generics>>;

  return function initTRPCInner<TOptions extends $Runtime>(
    runtime?: ValidateShape<TOptions, $Runtime>,
  ) {
    type $Formatter = PickFirstDefined<
      TOptions['errorFormatter'],
      ErrorFormatter<$Context, DefaultErrorShape>
    >;
    type $Transformer = TOptions['transformer'] extends DataTransformerOptions
      ? TOptions['transformer']
      : DefaultDataTransformer;
    type $ErrorShape = ErrorFormatterShape<$Formatter>;

    type $Config = RootConfig<{
      ctx: $Context;
      meta: $Meta;
      errorShape: $ErrorShape;
      transformer: $Transformer;
    }>;

    const errorFormatter = runtime?.errorFormatter ?? defaultFormatter;
    const transformer = getDataTransformer(
      runtime?.transformer ?? defaultTransformer,
    ) as $Transformer;

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
  };
}
