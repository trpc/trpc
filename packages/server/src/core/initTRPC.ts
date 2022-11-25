import { mergeRoutersGeneric } from './internals/__generated__/mergeRoutersGeneric';
import {
  DefaultErrorShape,
  ErrorFormatter,
  ErrorFormatterShape,
  defaultFormatter,
} from '../error/formatter';
import { createFlatProxy } from '../shared';
import {
  CombinedDataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
  defaultTransformer,
  getDataTransformer,
} from '../transformer';
import { FlatOverwrite } from '../types';
import {
  CreateRootConfigTypes,
  RootConfig,
  RootConfigTypes,
  RuntimeConfig,
  isServerDefault,
} from './internals/config';
import { createBuilder } from './internals/procedureBuilder';
import { PickFirstDefined, ValidateShape } from './internals/utils';
import { createMiddlewareFactory } from './middleware';
import { createRouterFactory } from './router';

type PartialRootConfigTypes = Partial<RootConfigTypes>;

type CreateRootConfigTypesFromPartial<TTypes extends PartialRootConfigTypes> =
  CreateRootConfigTypes<{
    ctx: TTypes['ctx'] extends RootConfigTypes['ctx'] ? TTypes['ctx'] : {};
    meta: TTypes['meta'] extends RootConfigTypes['meta'] ? TTypes['meta'] : {};
    errorShape: TTypes['errorShape'];
    transformer: DataTransformerOptions;
  }>;

/**
 * TODO: This can be improved:
 * - We should be able to chain `.meta()`/`.context()` only once
 * - Simplify typings
 * - Doesn't need to be a class but it doesn't really hurt either
 */

class TRPCBuilder<TParams extends PartialRootConfigTypes = {}> {
  context<TNewContext extends RootConfigTypes['ctx']>() {
    return new TRPCBuilder<FlatOverwrite<TParams, { ctx: TNewContext }>>();
  }
  meta<TNewMeta extends RootConfigTypes['meta']>() {
    return new TRPCBuilder<FlatOverwrite<TParams, { meta: TNewMeta }>>();
  }
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
 * Initialize tRPC - be done exactly once per backend
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
      ? TOptions['transformer'] extends DataTransformerOptions
        ? CombinedDataTransformer
        : DefaultDataTransformer
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
        runtime?.isDev ?? globalThis.process?.env?.NODE_ENV !== 'production',
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
       */
      procedure: createBuilder<$Config>(),
      /**
       * Create reusable middlewares
       */
      middleware: createMiddlewareFactory<$Config>(),
      /**
       * Create a router
       */
      router: createRouterFactory<$Config>(config),
      /**
       * Merge Routers
       */
      mergeRouters: mergeRoutersGeneric,
    };
  };
}
