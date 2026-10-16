import type { AnySchema, ErrorMap, InferSchemaInput, InferSchemaOutput, InitialInputSchema, InitialOutputSchema, MergedErrorMap, MetaPlugin, ORPCErrorConstructorMap, ProcedureContractDefinition, Schema } from '@orpc/contract'
import type { IntersectPick } from '@orpc/shared'
import type { BuilderWithInput, BuilderWithMiddlewares, BuilderWithOutput } from './builder-variants'
import type { Context, MergedInitialContext } from './context'
import type { Middleware } from './middleware'
import type { DecoratedMiddleware } from './middleware-decorated'
import type { OrderedMiddleware, ProcedureConfig, ProcedureHandler } from './procedure'
import type { AnyRouter } from './router'
import type { AugmentedRouter } from './router-utils'
import { getHiddenMetaPlugins, mergeErrorMap, resolveMetaPlugins } from '@orpc/contract'
import { toArray } from '@orpc/shared'
import { Lazy } from './lazy'
import { decorateMiddleware } from './middleware-decorated'
import { DecoratedProcedure } from './procedure-decorated'
import { augmentRouter } from './router-utils'

/**
 * The initial context type used when `.$context` is not called.
 * Augment this interface with `declare module '@orpc/server'` to define
 * a default initial context type globally.
 *
 * @see {@link https://orpc.dev/docs/context#default-initial-context | Context - Default Initial Context}
 */
export interface DefaultInitialContext {
}

export interface BuilderDefinition<
  TInputSchema extends AnySchema,
  TInjectedContext extends AnySchema,
  TErrorMap extends ErrorMap,
>extends ProcedureContractDefinition<TInputSchema, TInjectedContext, TErrorMap>, ProcedureConfig {
  orderedMiddlewares: OrderedMiddleware[]
}

/**
 * The procedure builder behind `os`. Chain its methods to gradually define
 * context, middleware, errors, schemas, and finally a handler or router.
 *
 * @see {@link https://orpc.dev/docs/procedure | Procedure}
 */
export class Builder<
  TInitialContext extends Context,
  TErrorMap extends ErrorMap,
> {
  '~orpc': BuilderDefinition<InitialInputSchema, InitialOutputSchema, TErrorMap>

  /**
   * Private constructor to prevent direct instantiation.
   * Use the static `create` method to initialize a new instance with a safe initial definition.
   */
  private constructor(definition: BuilderDefinition<InitialInputSchema, InitialOutputSchema, TErrorMap>) {
    this['~orpc'] = definition
  }

  /**
   * Creates a fresh builder with an empty definition.
   * Prefer the exported `os` instance over calling this directly.
   *
   * @see {@link https://orpc.dev/docs/procedure | Procedure}
   */
  static create<T extends Context = DefaultInitialContext>(): Builder<T & object, Record<never, never>> {
    // Using `& object` avoids "has no properties in common with type" errors
    // when combining procedures or routers with compatible but non-overlapping contexts.

    return new Builder({
      errorMap: {},
      meta: {},
      orderedMiddlewares: [],
    })
  }

  /**
   * Declares the initial context type that must be provided when executing
   * procedures built from this builder.
   *
   * @see {@link https://orpc.dev/docs/context#initial-context | Context - Initial Context}
   */
  $context<T extends Context = DefaultInitialContext>(): Builder<T & object, TErrorMap> {
    // Using `& object` avoids "has no properties in common with type" errors
    // when combining procedures or routers with compatible but non-overlapping contexts.

    // because we can't call $context after .use method so we don't need reset middlewares here
    return this as any
  }

  /**
   * Overrides the procedure configuration, such as disabling runtime
   * input/output validation.
   *
   * @see {@link https://orpc.dev/docs/recipes/validation-customization | Validation Customization}
   */
  $config(config: ProcedureConfig): Builder<TInitialContext, TErrorMap> {
    return new Builder({
      ...this['~orpc'],
      ...config,
    })
  }

  /**
   * Applies metadata plugins to procedures built from this builder.
   *
   * @see {@link https://orpc.dev/docs/metadata | Metadata}
   */
  meta(
    ...plugins: MetaPlugin<InitialInputSchema, InitialOutputSchema, TErrorMap>[]
  ): Builder<TInitialContext, TErrorMap> {
    const [meta, metaPlugins] = resolveMetaPlugins(
      this['~orpc'].meta,
      this['~orpc'].metaPlugins,
      plugins,
    )

    return new Builder({
      ...this['~orpc'],
      meta,
      metaPlugins,
    })
  }

  /**
   * Defines typesafe errors that procedures built from this builder can throw
   * via the `errors` utility in handlers and middleware.
   *
   * @see {@link https://orpc.dev/docs/error-handling#typesafe-errors | Error Handling - Typesafe Errors}
   */
  errors<U extends ErrorMap>(
    errors: U,
  ): Builder<TInitialContext, MergedErrorMap<TErrorMap, U>> {
    let builder = new Builder({
      ...this['~orpc'],
      errorMap: mergeErrorMap(this['~orpc'].errorMap, errors),
    })

    const plugins = getHiddenMetaPlugins(errors)
    if (plugins) {
      builder = builder.meta(...plugins) as any
    }

    return builder as any
  }

  /**
   * Applies a middleware that runs before the handler of every procedure
   * built from this builder.
   *
   * @see {@link https://orpc.dev/docs/middleware | Middleware}
   */
  use<
    $OutContext extends IntersectPick<TInitialContext, $OutContext>,
    $InContext extends Context = TInitialContext,
    $ErrorMap extends ErrorMap = TErrorMap,
  >(
    middleware: Middleware<
      $InContext | TInitialContext,
      $OutContext,
      InferSchemaOutput<InitialInputSchema>,
      InferSchemaInput<InitialOutputSchema>,
      $ErrorMap
    >,
  ): BuilderWithMiddlewares<
    MergedInitialContext<TInitialContext, object, $InContext>,
    $OutContext,
    MergedErrorMap<$ErrorMap, TErrorMap>
  > {
    let builder = new Builder({
      ...this['~orpc'],
      errorMap: mergeErrorMap(middleware['~orpc']?.errorMap ?? {}, this['~orpc'].errorMap),
      orderedMiddlewares: [...this['~orpc'].orderedMiddlewares, {
        middleware,
        inputSchemasLengthAtUse: this['~orpc'].inputSchemas?.length,
        outputSchemasLengthAtUse: this['~orpc'].outputSchemas?.length,
      }],
    })

    if (middleware['~orpc']?.metaPlugins) {
      builder = builder.meta(...middleware['~orpc']?.metaPlugins) as any
    }

    return builder as any
  }

  /**
   * Creates a standalone middleware that can be composed and applied to any
   * compatible builder or procedure with `.use`.
   *
   * @see {@link https://orpc.dev/docs/middleware | Middleware}
   */
  middleware<
    $OutContext extends IntersectPick<TInitialContext, $OutContext>,
    $Input,
    $Output = any, // $Output = any by default is important to make middleware can be used in any output by default
  >(
    middleware: Middleware<TInitialContext, $OutContext, $Input, $Output, TErrorMap>,
  ): DecoratedMiddleware<TInitialContext, $OutContext, $Input, $Output, TErrorMap> {
    const allMiddlewares = [
      ...this['~orpc'].orderedMiddlewares.map(({ middleware }) => middleware),
      middleware,
    ]

    let current = decorateMiddleware(allMiddlewares.shift()!)

    for (const mid of allMiddlewares) {
      current = current.use(mid) as any
    }

    current['~orpc'] = {
      ...current['~orpc'],
      errorMap: this['~orpc'].errorMap,
      metaPlugins: [
        ...toArray(this['~orpc'].metaPlugins),
        ...toArray(middleware['~orpc']?.metaPlugins),
      ],
    }

    return current
  }

  /**
   * Defines the input schema used to validate and type the procedure input.
   *
   * @see {@link https://orpc.dev/docs/procedure#inputoutput-validation | Procedure - Input/Output Validation}
   */
  input<$ extends AnySchema>(schema: $): BuilderWithInput<TInitialContext, object, $, TErrorMap> {
    let builder = new Builder({
      ...this['~orpc'],
      inputSchemas: [...toArray(this['~orpc'].inputSchemas), schema],
    })

    const plugins = getHiddenMetaPlugins(schema)
    if (plugins) {
      builder = builder.meta(...plugins) as any
    }

    return builder as any
  }

  /**
   * Defines the output schema used to validate and type the procedure output.
   *
   * @see {@link https://orpc.dev/docs/procedure#inputoutput-validation | Procedure - Input/Output Validation}
   */
  output<$ extends AnySchema>(schema: $): BuilderWithOutput<TInitialContext, object, $, TErrorMap> {
    let builder = new Builder({
      ...this['~orpc'],
      outputSchemas: [...toArray(this['~orpc'].outputSchemas), schema],
    })

    const plugins = getHiddenMetaPlugins(schema)
    if (plugins) {
      builder = builder.meta(...plugins) as any
    }

    return builder as any
  }

  /**
   * Defines the function that implements the procedure and completes the
   * chain, returning a callable procedure.
   *
   * @see {@link https://orpc.dev/docs/procedure | Procedure}
   */
  handler<T>(
    handler: ProcedureHandler<TInitialContext, InferSchemaOutput<InitialInputSchema>, T, ORPCErrorConstructorMap<TErrorMap>>,
  ): DecoratedProcedure<
    TInitialContext,
    object,
    InitialInputSchema,
    Schema<T>,
    TErrorMap
  > {
    let procedure = new DecoratedProcedure({
      ...this['~orpc'],
      handler,
    })

    const plugins = getHiddenMetaPlugins(handler)
    if (plugins) {
      procedure = procedure.meta(...plugins)
    }

    return procedure as any
  }

  /**
   * Applies the builder's middleware, errors, and metadata to every procedure
   * in the given router.
   *
   * @see {@link https://orpc.dev/docs/router#extending-router | Router - Extending Router}
   */
  router<T extends AnyRouter>(
    router: T,
  ): AugmentedRouter<T, TErrorMap> {
    return augmentRouter(router, {
      ...this['~orpc'],
      middlewares: this['~orpc'].orderedMiddlewares.map(({ middleware }) => middleware),
    }) as any
  }

  /**
   * Like `.router`, but loads the router lazily on first access, which helps
   * reduce startup time for large applications.
   *
   * @see {@link https://orpc.dev/docs/router#lazy-router | Router - Lazy Router}
   */
  lazy<T extends AnyRouter>(
    loader: () => Promise<{ default: T }>,
  ): Lazy<AugmentedRouter<T, TErrorMap>> {
    return new Lazy({
      loader: async () => {
        const { default: router } = await loader()
        return {
          default: this.router(router),
        }
      },
      meta: this['~orpc'].meta,
      metaPlugins: this['~orpc'].metaPlugins,
    })
  }
}

/**
 * The oRPC procedure builder. Chain methods like `.input`, `.use`, and `.handler`
 * to define procedures, then compose them into routers.
 *
 * @see {@link https://orpc.dev/docs/procedure | Procedure}
 */
export const os = Builder.create()
