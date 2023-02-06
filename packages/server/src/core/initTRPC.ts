import { mergeRoutersGeneric } from './internals/__generated__/mergeRoutersGeneric';
import {
  DefaultErrorShape,
  ErrorFormatter,
  ErrorFormatterShape,
  defaultFormatter,
} from '../error/formatter';
import { createFlatProxy } from '../shared';
import {
  DataTransformerOptions,
  DefaultDataTransformer,
  defaultTransformer,
  getDataTransformer,
} from '../transformer';
import { FlatOverwrite, Unwrap } from '../types';
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
import { AnyProcedure } from './procedure';
import {
  AnyRouter,
  ProcedureRouterRecord,
  Router,
  RouterDef,
  createRouterFactory,
} from './router';

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
    return new TRPCBuilder<
      FlatOverwrite<TParams, { ctx: Unwrap<TNewContext> }>
    >();
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
    const router = createRouterFactory<$Config>(config);

    type ClassToProcRouterRecord<TRouter extends object> = Router<
      RouterDef<
        $Config,
        {
          [TKey in keyof TRouter]: TRouter[TKey] extends
            | AnyProcedure
            | AnyRouter
            ? TRouter[TKey]
            : never;
        }
      >
    >;

    function isObjectOrFunction(
      value: unknown,
    ): value is Record<string, unknown> | ((...args: unknown[]) => unknown) {
      // check that value is object
      return (
        !!value &&
        !Array.isArray(value) &&
        (typeof value === 'object' || typeof value === 'function')
      );
    }

    function isRouterOrProcedure(
      value: unknown,
    ): value is AnyRouter | AnyProcedure {
      if (!isObjectOrFunction(value)) {
        return false;
      }
      const routerOrProcedure = value as AnyRouter | AnyProcedure;
      if (!routerOrProcedure._def) {
        return false;
      }

      // This would be better if we had a Symbol
      return routerOrProcedure._def.router || routerOrProcedure._def.procedure;
    }

    function toRouter<TObj extends object>(
      obj: TObj,
    ): ClassToProcRouterRecord<TObj> {
      const record: ProcedureRouterRecord = {};
      for (const key in obj) {
        if (isRouterOrProcedure(obj[key])) {
          (record as any)[key as unknown as string] = obj[key];
        }
      }
      return router(record) as unknown as ClassToProcRouterRecord<TObj>;
    }

    class RouterBase {
      public toRouter() {
        return toRouter(this);
      }
    }
    return {
      unstable_RouterBase: RouterBase,
      unstable_toRouter: toRouter,
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
      router,
      /**
       * Merge Routers
       */
      mergeRouters: mergeRoutersGeneric,
    };
  };
}
