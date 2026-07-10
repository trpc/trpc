import {
  defaultFormatter,
  type DefaultErrorShape,
  type ErrorFormatter,
} from './error/formatter';
import type { MiddlewareBuilder, MiddlewareFunction } from './middleware';
import { createMiddlewareFactory } from './middleware';
import type { ProcedureBuilder } from './procedureBuilder';
import { createBuilder } from './procedureBuilder';
import type { AnyRootTypes, CreateRootTypes } from './rootConfig';
import { isServerDefault, type RootConfig } from './rootConfig';
import type {
  AnyRouter,
  MergeRouters,
  RouterBuilder,
  RouterCallerFactory,
} from './router';
import {
  createCallerFactory,
  createRouterFactory,
  mergeRouters,
} from './router';
import type { DataTransformerOptions } from './transformer';
import { defaultTransformer, getDataTransformer } from './transformer';
import type { Unwrap, ValidateShape } from './types';
import type { UnsetMarker } from './utils';

type inferErrorFormatterShape<TType> =
  TType extends ErrorFormatter<any, infer TShape> ? TShape : DefaultErrorShape;
/** @internal */
export interface RuntimeConfigOptions<
  TContext extends object,
  TMeta extends object,
> extends Partial<
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
   * @see https://trpc.io/docs/v11/data-transformers
   */
  transformer?: DataTransformerOptions;
}

type ContextCallback = (...args: any[]) => object | Promise<object>;

export interface TRPCRootObject<
  TContext extends object,
  TMeta extends object,
  TOptions extends RuntimeConfigOptions<TContext, TMeta>,
  $Root extends AnyRootTypes = {
    ctx: TContext;
    meta: TMeta;
    errorShape: undefined extends TOptions['errorFormatter']
      ? DefaultErrorShape
      : inferErrorFormatterShape<TOptions['errorFormatter']>;
    transformer: undefined extends TOptions['transformer'] ? false : true;
  },
> {
  /**
   * Your router config
   * @internal
   */
  _config: RootConfig<$Root>;

  /**
   * Builder object for creating procedures
   * @see https://trpc.io/docs/v11/server/procedures
   */
  procedure: ProcedureBuilder<
    TContext,
    TMeta,
    object,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    false
  >;

  /**
   * Create reusable middlewares
   * @see https://trpc.io/docs/v11/server/middlewares
   */
  middleware: <$ContextOverrides>(
    fn: MiddlewareFunction<TContext, TMeta, object, $ContextOverrides, unknown>,
  ) => MiddlewareBuilder<TContext, TMeta, $ContextOverrides, unknown>;

  /**
   * Create a router
   * @see https://trpc.io/docs/v11/server/routers
   */
  router: RouterBuilder<$Root>;

  /**
   * Merge Routers
   * @see https://trpc.io/docs/v11/server/merging-routers
   */
  mergeRouters: <TRouters extends AnyRouter[]>(
    ...routerList: [...TRouters]
  ) => MergeRouters<TRouters>;

  /**
   * Create a server-side caller for a router
   * @see https://trpc.io/docs/v11/server/server-side-calls
   */
  createCallerFactory: RouterCallerFactory<$Root>;
}

class TRPCBuilder<TContext extends object, TMeta extends object> {
  /**
   * Add a context shape as a generic to the root object
   * @see https://trpc.io/docs/v11/server/context
   */
  context<TNewContext extends object | ContextCallback>() {
    return new TRPCBuilder<
      TNewContext extends ContextCallback ? Unwrap<TNewContext> : TNewContext,
      TMeta
    >();
  }

  /**
   * Add a meta shape as a generic to the root object
   * @see https://trpc.io/docs/v11/quickstart
   */
  meta<TNewMeta extends object>() {
    return new TRPCBuilder<TContext, TNewMeta>();
  }

  /**
   * Create the root object
   * @see https://trpc.io/docs/v11/server/routers#initialize-trpc
   */
  create<TOptions extends RuntimeConfigOptions<TContext, TMeta>>(
    opts?: ValidateShape<TOptions, RuntimeConfigOptions<TContext, TMeta>>,
  ): TRPCRootObject<TContext, TMeta, TOptions> {
    type $Root = CreateRootTypes<{
      ctx: TContext;
      meta: TMeta;
      errorShape: undefined extends TOptions['errorFormatter']
        ? DefaultErrorShape
        : inferErrorFormatterShape<TOptions['errorFormatter']>;
      transformer: undefined extends TOptions['transformer'] ? false : true;
    }>;

    const config: RootConfig<$Root> = {
      ...opts,
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
       * @see https://trpc.io/docs/v11/server/procedures
       */
      procedure: createBuilder<$Root['ctx'], $Root['meta']>({
        meta: opts?.defaultMeta,
      }),
      /**
       * Create reusable middlewares
       * @see https://trpc.io/docs/v11/server/middlewares
       */
      middleware: createMiddlewareFactory<$Root['ctx'], $Root['meta']>(),
      /**
       * Create a router
       * @see https://trpc.io/docs/v11/server/routers
       */
      router: createRouterFactory<$Root>(config),
      /**
       * Merge Routers
       * @see https://trpc.io/docs/v11/server/merging-routers
       */
      mergeRouters,
      /**
       * Create a server-side caller for a router
       * @see https://trpc.io/docs/v11/server/server-side-calls
       */
      createCallerFactory: createCallerFactory<$Root>(),
    };
  }
}

/**
 * Builder to initialize the tRPC root object - use this exactly once per backend
 * @see https://trpc.io/docs/v11/quickstart
 */
export const initTRPC = new TRPCBuilder();
export type { TRPCBuilder };
