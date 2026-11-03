import {
  defaultFormatter,
  type DefaultErrorShape,
  type ErrorFormatter,
} from './error/formatter';
import { assertPathSeparator } from './http/pathSeparator';
import type { MiddlewareBuilder, MiddlewareFunction } from './middleware';
import { createMiddlewareFactory } from './middleware';
import type { ProcedureBuilder } from './procedureBuilder';
import { createBuilder } from './procedureBuilder';
import type { AnyRootTypes, CreateRootTypes } from './rootConfig';
import { isDevDefault, isServerDefault, type RootConfig } from './rootConfig';
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
/**
 * The options `initTRPC.create()` takes.
 * @internal
 */
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
   * Serializes inputs and outputs, so they can carry types JSON can't, such
   * as `Date`. The client's links must use the same transformer.
   * @see https://trpc.io/docs/server/data-transformers
   */
  transformer?: DataTransformerOptions;
}

type ContextCallback = (...args: any[]) => object | Promise<object>;

/**
 * What `initTRPC.create()` returns: the builders for your procedures,
 * middlewares and routers. Create it once per backend.
 * @see https://trpc.io/docs/server/routers#initialize-trpc
 */
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
   * The config the root object was created with.
   * @internal
   */
  _config: RootConfig<$Root>;

  /**
   * The base procedure builder. Add inputs, middlewares and a resolver to
   * make a query, mutation or subscription.
   * @see https://trpc.io/docs/server/procedures
   */
  procedure: ProcedureBuilder<
    TContext,
    TMeta,
    object,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    false,
    $Root['errorShape']
  >;

  /**
   * Creates a middleware you can reuse across procedures with `.use()`.
   * @see https://trpc.io/docs/server/middlewares
   */
  middleware: <$ContextOverrides>(
    fn: MiddlewareFunction<TContext, TMeta, object, $ContextOverrides, unknown>,
  ) => MiddlewareBuilder<TContext, TMeta, $ContextOverrides, unknown>;

  /**
   * Creates a router from a record of procedures and sub-routers.
   * @see https://trpc.io/docs/server/routers
   */
  router: RouterBuilder<$Root>;

  /**
   * Merges routers into one, flattening their procedures into the same
   * namespace.
   * @see https://trpc.io/docs/server/merging-routers#merging-with-tmergerouters
   */
  mergeRouters: <TRouters extends AnyRouter[]>(
    ...routerList: [...TRouters]
  ) => MergeRouters<TRouters>;

  /**
   * Creates a factory for callers, which call a router's procedures
   * directly on the server, without HTTP.
   * @see https://trpc.io/docs/server/server-side-calls
   */
  createCallerFactory: RouterCallerFactory<$Root>;
}

/**
 * The type of `initTRPC`. Chain `.context()` and `.meta()` to set their
 * types, then call `.create()`.
 */
class TRPCBuilder<TContext extends object, TMeta extends object> {
  /**
   * Sets the type of the context every procedure gets. Pass the type, or
   * the type of your `createContext` function.
   * @see https://trpc.io/docs/server/context#defining-the-context-type
   */
  context<TNewContext extends object | ContextCallback>() {
    return new TRPCBuilder<
      TNewContext extends ContextCallback ? Unwrap<TNewContext> : TNewContext,
      TMeta
    >();
  }

  /**
   * Sets the type of the metadata procedures can set with `.meta()`.
   * @see https://trpc.io/docs/server/metadata
   */
  meta<TNewMeta extends object>() {
    return new TRPCBuilder<TContext, TNewMeta>();
  }

  /**
   * Creates the root object, which holds the builders for your procedures,
   * middlewares and routers.
   * @see https://trpc.io/docs/server/routers#initialize-trpc
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
      isDev: opts?.isDev ?? isDevDefault(),
      allowOutsideOfServer: opts?.allowOutsideOfServer ?? false,
      errorFormatter: opts?.errorFormatter ?? defaultFormatter,
      isServer: opts?.isServer ?? isServerDefault,
      /**
       * These are just types, they can't be used at runtime
       * @internal
       */
      $types: null as any,
    };

    if (opts?.pathSeparator !== undefined) {
      assertPathSeparator(opts.pathSeparator);
    }

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
       * @see https://trpc.io/docs/server/procedures
       */
      procedure: createBuilder<
        $Root['ctx'],
        $Root['meta'],
        $Root['errorShape']
      >({
        meta: opts?.defaultMeta,
        config,
      }),
      /**
       * Create reusable middlewares
       * @see https://trpc.io/docs/server/middlewares
       */
      middleware: createMiddlewareFactory<$Root['ctx'], $Root['meta']>(),
      /**
       * Create a router
       * @see https://trpc.io/docs/server/routers
       */
      router: createRouterFactory<$Root>(config),
      /**
       * Merge Routers
       * @see https://trpc.io/docs/server/merging-routers
       */
      mergeRouters,
      /**
       * Create a server-side caller for a router
       * @see https://trpc.io/docs/server/server-side-calls
       */
      createCallerFactory: createCallerFactory<$Root>(),
    };
  }
}

/**
 * The starting point of every tRPC backend. Call it once.
 * @example
 * ```ts
 * const t = initTRPC.context<Context>().create();
 * export const router = t.router;
 * export const publicProcedure = t.procedure;
 * ```
 * @see https://trpc.io/docs/server/routers#initialize-trpc
 */
export const initTRPC = new TRPCBuilder();
export type { TRPCBuilder };
