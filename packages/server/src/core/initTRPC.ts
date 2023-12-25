import { DefaultErrorShape, defaultFormatter } from '../error/formatter';
import { TRPC_ERROR_CODE_NUMBER, TRPCErrorShape } from '../rpc';
import { createFlatProxy } from '../shared/createProxy';
import {
  DataTransformerOptions,
  defaultTransformer,
  getCombinedDataTransformer,
} from '../transformer';
import { MaybePromise } from '../types';
import {
  isServerDefault,
  RootConfig,
  RootConfigTypes,
  RuntimeConfig,
} from './internals/config';
import { mergeRouters } from './internals/mergeRouters';
import { createBuilder } from './internals/procedureBuilder';
import { createMiddlewareFactory } from './middleware';
import { createRouterFactory } from './router';

/**
 * The runtime config that are used and actually represents real values underneath
 * @internal
 */
export interface RuntimeConfigOptions<TTypes extends RootConfigTypes>
  extends Partial<Omit<RuntimeConfig<TTypes>, 'transformer'>> {
  /**
   * Use a data transformer
   * @link https://trpc.io/docs/data-transformers
   */
  transformer?: DataTransformerOptions;
}
interface TRPCRootBuilder<TContext extends object, TMeta extends object> {
  /**
   * Set the context type
   * @see https://trpc.io/docs/server/context
   */
  context: <
    $Context extends object | ((...args: any[]) => MaybePromise<object>),
  >() => TRPCRootBuilder<
    $Context extends () => MaybePromise<infer T> ? T : $Context,
    TMeta
  >;
  /**
   * Set the metadata
   * @see https://trpc.io/docs/server/metadata
   */
  meta: <$Meta extends object>() => TRPCRootBuilder<TContext, $Meta>;
  /**
   * Create a new tRPC instance
   */
  create: <
    $ErrorShape extends TRPCErrorShape<TRPC_ERROR_CODE_NUMBER> = DefaultErrorShape,
    $Transformer extends DataTransformerOptions | undefined = undefined,
  >(
    opts?: RuntimeConfigOptions<{
      ctx: TContext;
      meta: TMeta;
      errorShape: $ErrorShape;
      transformer: $Transformer extends DataTransformerOptions ? true : false;
    }>,
  ) => ReturnType<
    typeof createTRPCInner<TContext, TMeta, $ErrorShape, $Transformer>
  >;
}

function createTRPCInner<
  TContext extends object,
  TMeta extends object,
  TErrorShape extends TRPCErrorShape<TRPC_ERROR_CODE_NUMBER>,
  TTransformerOptions,
>(
  runtime: RuntimeConfigOptions<{
    ctx: TContext;
    meta: TMeta;
    errorShape: TErrorShape;
    transformer: TTransformerOptions extends DataTransformerOptions
      ? true
      : false;
  }>,
) {
  type $Config = RootConfig<{
    ctx: TContext;
    meta: TMeta;
    errorShape: TErrorShape;
    transformer: TTransformerOptions extends DataTransformerOptions
      ? true
      : false;
  }>;

  const errorFormatter = runtime?.errorFormatter ?? defaultFormatter;
  const transformer = getCombinedDataTransformer(
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
     */
    procedure: createBuilder<
      $Config['$types']['ctx'],
      $Config['$types']['meta']
    >({
      meta: runtime?.defaultMeta,
    }),
    /**
     * Create reusable middlewares
     */
    middleware: createMiddlewareFactory<
      $Config['$types']['ctx'],
      $Config['$types']['meta']
    >(),
    /**
     * Create a router
     */
    router: createRouterFactory<$Config>(config),
    /**
     * Merge Routers
     */
    mergeRouters,
  };
}

/**
 * Initialize tRPC - done exactly once per backend
 * @see https://trpc.io/docs/server/routers#initialize-trpc
 */
export const initTRPC: TRPCRootBuilder<object, object> = {
  context: () => initTRPC as TRPCRootBuilder<any, any>,
  meta: () => initTRPC as TRPCRootBuilder<any, any>,
  create: () => {
    throw new Error('not implemented');
  },
};
