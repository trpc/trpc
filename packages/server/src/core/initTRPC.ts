import {
  DefaultErrorShape,
  defaultFormatter,
  ErrorFormatter,
  ErrorFormatterShape,
} from '../error/formatter';
import { createFlatProxy } from '../shared/createProxy';
import {
  DataTransformerOptions,
  DefaultDataTransformer,
  defaultTransformer,
  getDataTransformer,
} from '../transformer';
import { FlatOverwrite, Unwrap } from '../types';
import {
  CreateRootConfigTypes,
  isServerDefault,
  RootConfig,
  RootConfigTypes,
  RuntimeConfig,
} from './internals/config';
import { mergeRouters } from './internals/mergeRouters';
import { createBuilder } from './internals/procedureBuilder';
import { PickFirstDefined, ValidateShape } from './internals/utils';
import { createMiddlewareFactory } from './middleware';
import { createRouterFactory } from './router';

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
  context<
    TNewContext extends
      | RootConfigTypes['ctx']
      | ((...args: unknown[]) => RootConfigTypes['ctx']),
  >() {
    type NextParams = FlatOverwrite<TParams, { ctx: Unwrap<TNewContext> }>;

    return new TRPCBuilder<NextParams>();
  }

  meta<TNewMeta extends RootConfigTypes['meta']>() {
    type NextParams = FlatOverwrite<TParams, { meta: TNewMeta }>;

    return new TRPCBuilder<NextParams>();
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
 * Initialize tRPC - done exactly once per backend
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
      procedure: createBuilder<$Config>({
        meta: runtime?.defaultMeta,
      }),
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
      mergeRouters,
    };
  };
}
