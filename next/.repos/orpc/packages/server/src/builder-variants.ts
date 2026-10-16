import type { AnySchema, ErrorMap, InferSchemaInput, InferSchemaOutput, InitialInputSchema, InitialOutputSchema, MergedErrorMap, MergedSchema, MetaPlugin, ORPCErrorConstructorMap, Schema } from '@orpc/contract'
import type { IntersectPick } from '@orpc/shared'
import type { BuilderDefinition } from './builder'
import type { Context, MergedContext, MergedInitialContext } from './context'
import type { Lazy } from './lazy'
import type { Middleware } from './middleware'
import type { DecoratedMiddleware } from './middleware-decorated'
import type { ProcedureHandler } from './procedure'
import type { DecoratedProcedure } from './procedure-decorated'
import type { Router } from './router'
import type { AugmentedRouterWithMiddlewares } from './router-utils'

/**
 * The builder variant returned after `.use` is called.
 * `.$context` and `.$config` are no longer available once middleware is applied.
 *
 * @see {@link https://orpc.dev/docs/procedure | Procedure}
 */
export interface BuilderWithMiddlewares<
  TInitialContext extends Context,
  TInjectedContext extends Context,
  TErrorMap extends ErrorMap,
> {
  '~orpc': BuilderDefinition<InitialInputSchema, InitialOutputSchema, TErrorMap>

  /**
   * Applies metadata plugins to procedures built from this builder.
   *
   * @see {@link https://orpc.dev/docs/metadata | Metadata}
   */
  'meta'(
    ...plugins: MetaPlugin<InitialInputSchema, InitialOutputSchema, TErrorMap>[]
  ): BuilderWithMiddlewares<TInitialContext, TInjectedContext, TErrorMap>

  /**
   * Defines typesafe errors that procedures built from this builder can throw
   * via the `errors` utility in handlers and middleware.
   *
   * @see {@link https://orpc.dev/docs/error-handling#typesafe-errors | Error Handling - Typesafe Errors}
   */
  'errors'<T extends ErrorMap>(
    errors: T,
  ): BuilderWithMiddlewares<TInitialContext, TInjectedContext, MergedErrorMap<TErrorMap, T>>

  /**
   * Applies a middleware that runs before the handler of every procedure
   * built from this builder.
   *
   * @see {@link https://orpc.dev/docs/middleware | Middleware}
   */
  'use'<
    $OutContext extends IntersectPick<MergedContext<TInitialContext, TInjectedContext>, $OutContext>,
    $InContext extends Context = MergedContext<TInitialContext, TInjectedContext>,
    $ErrorMap extends ErrorMap = TErrorMap,
  >(
    middleware: Middleware<
      $InContext | MergedContext<TInitialContext, TInjectedContext>,
      $OutContext,
      InferSchemaOutput<InitialInputSchema>,
      InferSchemaInput<InitialOutputSchema>,
      $ErrorMap
    >,
  ): BuilderWithMiddlewares<
    MergedInitialContext<TInitialContext, TInjectedContext, $InContext>,
    MergedContext<TInjectedContext, $OutContext>,
    MergedErrorMap<$ErrorMap, TErrorMap>
  >

  /**
   * Creates a standalone middleware that can be composed and applied to any
   * compatible builder or procedure with `.use`.
   *
   * @see {@link https://orpc.dev/docs/middleware | Middleware}
   */
  'middleware'<
    $OutContext extends IntersectPick<MergedContext<TInitialContext, TInjectedContext>, $OutContext>,
    $Input,
    $InContext extends Context = MergedContext<TInitialContext, TInjectedContext>,
    $Output = any, // $Output = any by default is important to make middleware can be used in any output by default,
  >(
    middleware: Middleware<
      $InContext | MergedContext<TInitialContext, TInjectedContext>,
      $OutContext,
      $Input,
      $Output,
      TErrorMap
    >,
  ): DecoratedMiddleware<
    MergedInitialContext<TInitialContext, TInjectedContext, $InContext>,
    MergedContext<TInjectedContext, $OutContext>,
    $Input,
    $Output,
    TErrorMap
  >

  /**
   * Defines the input schema used to validate and type the procedure input.
   *
   * @see {@link https://orpc.dev/docs/procedure#inputoutput-validation | Procedure - Input/Output Validation}
   */
  'input'<T extends AnySchema>(
    schema: T
  ): BuilderWithInput<TInitialContext, TInjectedContext, T, TErrorMap>

  /**
   * Defines the output schema used to validate and type the procedure output.
   *
   * @see {@link https://orpc.dev/docs/procedure#inputoutput-validation | Procedure - Input/Output Validation}
   */
  'output'<T extends AnySchema>(
    schema: T
  ): BuilderWithOutput<TInitialContext, TInjectedContext, T, TErrorMap>

  /**
   * Defines the function that implements the procedure and completes the
   * chain, returning a callable procedure.
   *
   * @see {@link https://orpc.dev/docs/procedure | Procedure}
   */
  'handler'<T>(
    handler: ProcedureHandler<MergedContext<TInitialContext, TInjectedContext>, InferSchemaOutput<InitialInputSchema>, T, ORPCErrorConstructorMap<TErrorMap>>,
  ): DecoratedProcedure<
    TInitialContext,
    TInjectedContext,
    InitialInputSchema,
    Schema<T>,
    TErrorMap
  >

  /**
   * Applies the builder's middleware, errors, and metadata to every procedure
   * in the given router.
   *
   * @see {@link https://orpc.dev/docs/router#extending-router | Router - Extending Router}
   */
  'router'<T extends Router<MergedContext<TInitialContext, TInjectedContext>>>(
    router: T,
  ): AugmentedRouterWithMiddlewares<T, TInitialContext, TInjectedContext, TErrorMap>

  /**
   * Like `.router`, but loads the router lazily on first access, which helps
   * reduce startup time for large applications.
   *
   * @see {@link https://orpc.dev/docs/router#lazy-router | Router - Lazy Router}
   */
  'lazy'<T extends Router<MergedContext<TInitialContext, TInjectedContext>>>(
    loader: () => Promise<{ default: T }>,
  ): Lazy<AugmentedRouterWithMiddlewares<T, TInitialContext, TInjectedContext, TErrorMap>>
}

/**
 * The builder variant returned after `.input` is called.
 * Only procedure-level methods remain available once an input schema is defined.
 *
 * @see {@link https://orpc.dev/docs/procedure | Procedure}
 */
export interface BuilderWithInput<
  TInitialContext extends Context,
  TInjectedContext extends Context,
  TInputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> {
  '~orpc': BuilderDefinition<TInputSchema, InitialOutputSchema, TErrorMap>

  /**
   * Applies metadata plugins to procedures built from this builder.
   *
   * @see {@link https://orpc.dev/docs/metadata | Metadata}
   */
  'meta'(
    ...plugins: MetaPlugin<TInputSchema, InitialOutputSchema, TErrorMap>[]
  ): BuilderWithInput<TInitialContext, TInjectedContext, TInputSchema, TErrorMap>

  /**
   * Defines typesafe errors that procedures built from this builder can throw
   * via the `errors` utility in handlers and middleware.
   *
   * @see {@link https://orpc.dev/docs/error-handling#typesafe-errors | Error Handling - Typesafe Errors}
   */
  'errors'<T extends ErrorMap>(
    errors: T,
  ): BuilderWithInput<TInitialContext, TInjectedContext, TInputSchema, MergedErrorMap<TErrorMap, T>>

  /**
   * Applies a middleware that runs before the handler and can access the
   * validated input.
   *
   * @see {@link https://orpc.dev/docs/middleware | Middleware}
   */
  'use'<
    $OutContext extends IntersectPick<MergedContext<TInitialContext, TInjectedContext>, $OutContext>,
    $InContext extends Context = MergedContext<TInitialContext, TInjectedContext>,
    $ErrorMap extends ErrorMap = TErrorMap,
  >(
    middleware: Middleware<
      $InContext | MergedContext<TInitialContext, TInjectedContext>,
      $OutContext,
      InferSchemaOutput<TInputSchema>,
      InferSchemaInput<InitialOutputSchema>,
      $ErrorMap
    >,
  ): BuilderWithInput<
    MergedInitialContext<TInitialContext, TInjectedContext, $InContext>,
    MergedContext<TInjectedContext, $OutContext>,
    TInputSchema,
    MergedErrorMap<$ErrorMap, TErrorMap>
  >

  /**
   * Adds an additional input schema, merged with the previously defined one.
   *
   * @see {@link https://orpc.dev/docs/procedure#multiple-schemas | Procedure - Multiple Schemas}
   */
  'input'<T extends AnySchema>(
    schema: T
  ): BuilderWithInput<TInitialContext, TInjectedContext, MergedSchema<T, TInputSchema>, TErrorMap>

  /**
   * Defines the output schema used to validate and type the procedure output.
   *
   * @see {@link https://orpc.dev/docs/procedure#inputoutput-validation | Procedure - Input/Output Validation}
   */
  'output'<T extends AnySchema>(
    schema: T
  ): BuilderWithInputOutput<TInitialContext, TInjectedContext, TInputSchema, T, TErrorMap>

  /**
   * Defines the function that implements the procedure and completes the
   * chain, returning a callable procedure.
   *
   * @see {@link https://orpc.dev/docs/procedure | Procedure}
   */
  'handler'<T>(
    handler: ProcedureHandler<MergedContext<TInitialContext, TInjectedContext>, InferSchemaOutput<TInputSchema>, T, ORPCErrorConstructorMap<TErrorMap>>,
  ): DecoratedProcedure<
    TInitialContext,
    TInjectedContext,
    TInputSchema,
    Schema<T>,
    TErrorMap
  >
}

/**
 * The builder variant returned after `.output` is called.
 * Only procedure-level methods remain available once an output schema is defined.
 *
 * @see {@link https://orpc.dev/docs/procedure | Procedure}
 */
export interface BuilderWithOutput<
  TInitialContext extends Context,
  TInjectedContext extends Context,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> {
  '~orpc': BuilderDefinition<InitialInputSchema, TOutputSchema, TErrorMap>

  /**
   * Applies metadata plugins to procedures built from this builder.
   *
   * @see {@link https://orpc.dev/docs/metadata | Metadata}
   */
  'meta'(
    ...plugins: MetaPlugin<InitialInputSchema, TOutputSchema, TErrorMap>[]
  ): BuilderWithOutput<TInitialContext, TInjectedContext, TOutputSchema, TErrorMap>

  /**
   * Defines typesafe errors that procedures built from this builder can throw
   * via the `errors` utility in handlers and middleware.
   *
   * @see {@link https://orpc.dev/docs/error-handling#typesafe-errors | Error Handling - Typesafe Errors}
   */
  'errors'<T extends ErrorMap>(
    errors: T,
  ): BuilderWithOutput<TInitialContext, TInjectedContext, TOutputSchema, MergedErrorMap<TErrorMap, T>>

  /**
   * Applies a middleware that runs before the handler and can access the
   * typed output.
   *
   * @see {@link https://orpc.dev/docs/middleware | Middleware}
   */
  'use'<
    $OutContext extends IntersectPick<MergedContext<TInitialContext, TInjectedContext>, $OutContext>,
    $InContext extends Context = MergedContext<TInitialContext, TInjectedContext>,
    $ErrorMap extends ErrorMap = TErrorMap,
  >(
    middleware: Middleware<
      $InContext | MergedContext<TInitialContext, TInjectedContext>,
      $OutContext,
      InferSchemaOutput<InitialInputSchema>,
      InferSchemaInput<TOutputSchema>,
      $ErrorMap
    >,
  ): BuilderWithOutput<
    MergedInitialContext<TInitialContext, TInjectedContext, $InContext>,
    MergedContext<TInjectedContext, $OutContext>,
    TOutputSchema,
    MergedErrorMap<$ErrorMap, TErrorMap>
  >

  /**
   * Defines the input schema used to validate and type the procedure input.
   *
   * @see {@link https://orpc.dev/docs/procedure#inputoutput-validation | Procedure - Input/Output Validation}
   */
  'input'<T extends AnySchema>(
    schema: T
  ): BuilderWithInputOutput<TInitialContext, TInjectedContext, T, TOutputSchema, TErrorMap>

  /**
   * Adds an additional output schema, merged with the previously defined one.
   *
   * @see {@link https://orpc.dev/docs/procedure#multiple-schemas | Procedure - Multiple Schemas}
   */
  'output'<T extends AnySchema>(
    schema: T
  ): BuilderWithOutput<TInitialContext, TInjectedContext, MergedSchema<T, TOutputSchema>, TErrorMap>

  /**
   * Defines the function that implements the procedure and completes the
   * chain, returning a callable procedure.
   *
   * @see {@link https://orpc.dev/docs/procedure | Procedure}
   */
  'handler'<T extends InferSchemaInput<TOutputSchema>>(
    handler: ProcedureHandler<MergedContext<TInitialContext, TInjectedContext>, InferSchemaOutput<InitialInputSchema>, T, ORPCErrorConstructorMap<TErrorMap>>,
  ): DecoratedProcedure<TInitialContext, TInjectedContext, InitialInputSchema, TOutputSchema, TErrorMap>
}

/**
 * The builder variant returned after both `.input` and `.output` are called.
 * Only procedure-level methods remain available.
 *
 * @see {@link https://orpc.dev/docs/procedure | Procedure}
 */
export interface BuilderWithInputOutput<
  TInitialContext extends Context,
  TInjectedContext extends Context,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> {
  '~orpc': BuilderDefinition<TInputSchema, TOutputSchema, TErrorMap>

  /**
   * Applies metadata plugins to procedures built from this builder.
   *
   * @see {@link https://orpc.dev/docs/metadata | Metadata}
   */
  'meta'(
    ...plugins: MetaPlugin<TInputSchema, TOutputSchema, TErrorMap>[]
  ): BuilderWithInputOutput<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap>

  /**
   * Defines typesafe errors that procedures built from this builder can throw
   * via the `errors` utility in handlers and middleware.
   *
   * @see {@link https://orpc.dev/docs/error-handling#typesafe-errors | Error Handling - Typesafe Errors}
   */
  'errors'<T extends ErrorMap>(
    errors: T,
  ): BuilderWithInputOutput<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, MergedErrorMap<TErrorMap, T>>

  /**
   * Applies a middleware that runs before the handler and can access the
   * validated input and typed output.
   *
   * @see {@link https://orpc.dev/docs/middleware | Middleware}
   */
  'use'<
    $OutContext extends IntersectPick<MergedContext<TInitialContext, TInjectedContext>, $OutContext>,
    $InContext extends Context = MergedContext<TInitialContext, TInjectedContext>,
    $ErrorMap extends ErrorMap = TErrorMap,
  >(
    middleware: Middleware<
      $InContext | MergedContext<TInitialContext, TInjectedContext>,
      $OutContext,
      InferSchemaOutput<TInputSchema>,
      InferSchemaInput<TOutputSchema>,
      $ErrorMap
    >,
  ): BuilderWithInputOutput<
    MergedInitialContext<TInitialContext, TInjectedContext, $InContext>,
    MergedContext<TInjectedContext, $OutContext>,
    TInputSchema,
    TOutputSchema,
    MergedErrorMap<$ErrorMap, TErrorMap>
  >

  /**
   * Adds an additional input schema, merged with the previously defined one.
   *
   * @see {@link https://orpc.dev/docs/procedure#multiple-schemas | Procedure - Multiple Schemas}
   */
  'input'<T extends AnySchema>(
    schema: T
  ): BuilderWithInputOutput<TInitialContext, TInjectedContext, MergedSchema<T, TInputSchema>, TOutputSchema, TErrorMap>

  /**
   * Adds an additional output schema, merged with the previously defined one.
   *
   * @see {@link https://orpc.dev/docs/procedure#multiple-schemas | Procedure - Multiple Schemas}
   */
  'output'<T extends AnySchema>(
    schema: T
  ): BuilderWithInputOutput<TInitialContext, TInjectedContext, TInputSchema, MergedSchema<T, TOutputSchema>, TErrorMap>

  /**
   * Defines the function that implements the procedure and completes the
   * chain, returning a callable procedure.
   *
   * @see {@link https://orpc.dev/docs/procedure | Procedure}
   */
  'handler'<T extends InferSchemaInput<TOutputSchema>>(
    handler: ProcedureHandler<MergedContext<TInitialContext, TInjectedContext>, InferSchemaOutput<TInputSchema>, T, ORPCErrorConstructorMap<TErrorMap>>,
  ): DecoratedProcedure<TInitialContext, TInjectedContext, TInputSchema, TOutputSchema, TErrorMap>
}
