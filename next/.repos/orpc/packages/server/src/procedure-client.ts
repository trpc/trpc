import type { Client, ClientContext } from '@orpc/client'
import type { AnySchema, ErrorMap, InferSchemaInput, InferSchemaOutput, ORPCErrorConstructorMap, ORPCErrorFromErrorMap } from '@orpc/contract'
import type { Interceptor, MaybeOptionalOptions, Promisable, PromiseWithError, ThrowableError, Value } from '@orpc/shared'
import type { Context } from './context'
import type { Lazyable } from './lazy'
import type { MiddlewareDone } from './middleware'
import type { AnyProcedure, Procedure, ProcedureHandlerOptions } from './procedure'
import { ORPCError, wrapAsyncIteratorPreservingEventMeta } from '@orpc/client'
import { createORPCErrorConstructorMap, reconcileORPCError, ValidationError } from '@orpc/contract'
import { getTracer, intercept, isAsyncIteratorObject, mergeTwoLevels, override, resolveMaybeOptionalOptions, runWithSpan, toArray, traceAsyncIterator, traceReadableStream, value } from '@orpc/shared'
import { unlazy } from './lazy'

export type ProcedureClient<
  TClientContext extends ClientContext,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> = Client<
  TClientContext,
  InferSchemaInput<TInputSchema>,
  InferSchemaOutput<TOutputSchema>,
  ORPCErrorFromErrorMap<TErrorMap> | ThrowableError
>

export interface ProcedureClientInterceptorOptions<TInitialContext extends Context, TErrorMap extends ErrorMap> extends ProcedureHandlerOptions<TInitialContext, unknown, ORPCErrorConstructorMap<TErrorMap>> {
}
export type ProcedureClientInterceptor<TInitialContext extends Context, TOutputSchema extends AnySchema, TErrorMap extends ErrorMap> = Interceptor<
  ProcedureClientInterceptorOptions<TInitialContext, TErrorMap>,
  PromiseWithError<InferSchemaOutput<TOutputSchema>, ORPCErrorFromErrorMap<TErrorMap> | ThrowableError>
>

export type ProcedureClientOptions<
  TInitialContext extends Context,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
  TClientContext extends ClientContext,
>
  = & {
    path?: string[]
    interceptors?: ProcedureClientInterceptor<TInitialContext, TOutputSchema, TErrorMap>[]
  }
  & (
    object extends TInitialContext
      ? { context?: Value<Promisable<TInitialContext>, [clientContext: TClientContext]> }
      : { context: Value<Promisable<TInitialContext>, [clientContext: TClientContext]> }
  )

export function createProcedureClient<
  TInitialContext extends Context,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
  TClientContext extends ClientContext = object,
>(
  lazyableProcedure: Lazyable<Procedure<TInitialContext, any, TInputSchema, TOutputSchema, TErrorMap>>,
  ...rest: MaybeOptionalOptions<
    ProcedureClientOptions<
      TInitialContext,
      TOutputSchema,
      TErrorMap,
      TClientContext
    >
  >
): ProcedureClient<TClientContext, TInputSchema, TOutputSchema, TErrorMap> {
  const options = resolveMaybeOptionalOptions(rest)

  return async (...[input, callerOptions]) => {
    const path = toArray(options.path)
    const { default: procedure } = await unlazy(lazyableProcedure)

    // callerOptions.context can be undefined when all field is optional
    const clientContext = callerOptions?.context ?? {} as TClientContext
    // options.context can be undefined when all field is optional
    const context = await value(options.context, clientContext) as TInitialContext | undefined ?? {} as TInitialContext
    const errors = createORPCErrorConstructorMap(procedure['~orpc'].errorMap)

    const reconcileError = async (e: ThrowableError) => {
      if (e instanceof ORPCError) {
        return await reconcileORPCError(procedure['~orpc'].errorMap, e)
      }

      return e
    }

    try {
      const output = await runWithSpan('call_procedure', (span) => {
        span?.setAttribute('procedure.path', path)

        return intercept(
          options.interceptors,
          {
            context,
            // input can be optional if it is undefinable
            input: input as InferSchemaInput<TInputSchema>,
            errors,
            path,
            procedure: procedure as AnyProcedure,
            signal: callerOptions?.signal,
            lastEventId: callerOptions?.lastEventId,
          },
          interceptorOptions => executeProcedureInternal(interceptorOptions.procedure, interceptorOptions),
        )
      })

      if (isAsyncIteratorObject(output)) {
        /**
         * traceAsyncIterator/wrapAsyncIteratorPreservingEventMeta return AsyncIteratorClass
         * which is backwards compatible with AsyncIteratorObject.
         *
         * @warning
         * If remove this return, can be breaking change
         * because AsyncIteratorClass convert `.throw` to `.return` (rarely used)
         *
         * @warning
         * Remember use `override` for AsyncIteratorObject to remain other special properties
         */
        return override(output, wrapAsyncIteratorPreservingEventMeta(
          getTracer() ? traceAsyncIterator('consume_async_iterator_object_output', output) : output,
          { mapError: reconcileError },
        )) as typeof output
      }

      else if (getTracer() && (output as unknown) instanceof ReadableStream) {
        /**
         * @warning
         * Remember use `override` for ReadableStream to remain other special properties
         */
        return override(output, traceReadableStream('consume_octet_stream_output', output)) as typeof output
      }

      return output
    }
    catch (e) {
      throw await reconcileError(e as ThrowableError)
    }
  }
}

async function validateInput(i: number, schema: AnySchema, input: unknown): Promise<any> {
  return runWithSpan(`validate_input.${i}`, async (span) => {
    span?.setAttribute('input_schema.index', i)

    const result = await schema['~standard'].validate(input)

    if (result.issues) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Input validation failed',
        data: {
          issues: result.issues,
        },
        cause: new ValidationError({
          message: 'Input validation failed',
          issues: result.issues,
          invalidData: input,
        }),
      })
    }

    return result.value
  })
}

async function validateOutput(i: number, schema: AnySchema, output: unknown): Promise<any> {
  return runWithSpan(`validate_output.${i}`, async (span) => {
    span?.setAttribute('output_schema.index', i)

    const result = await schema['~standard'].validate(output)

    if (result.issues) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Output validation failed',
        cause: new ValidationError({
          message: 'Output validation failed',
          issues: result.issues,
          invalidData: output,
        }),
      })
    }

    return result.value
  })
}

const middlewareDone: MiddlewareDone<any> = (...rest) => {
  const options = resolveMaybeOptionalOptions(rest)

  return {
    output: options.output,
    // context can be undefined when all field is optional
    context: options.context ?? {} as any,
  }
}

async function executeProcedureInternal(procedure: AnyProcedure, options: ProcedureHandlerOptions<any, any, any>): Promise<any> {
  const inputSchemas = toArray(procedure['~orpc'].inputSchemas)
  const outputSchemas = toArray(procedure['~orpc'].outputSchemas)
  const orderedMiddlewares = procedure['~orpc'].orderedMiddlewares

  const next = async (
    midIndex: number,
    context: Context,
    input: unknown,
  ): Promise<{ output: unknown, context: Record<any, any> }> => {
    let currentInput = input
    let middlewareInput = input

    const startInputIndex = midIndex === 0
      ? 0
      : orderedMiddlewares[midIndex - 1]!.inputSchemasLengthAtUse ?? 0
    const endInputIndex = midIndex === orderedMiddlewares.length
      ? inputSchemas.length
      : orderedMiddlewares[midIndex]!.inputSchemasLengthAtUse ?? 0

    /**
     * Each schema after the first validates the original input with the results so far applied, then
     * its result is merged in, so no schema loses a field an earlier one stripped. Values that are not
     * plain objects stay piped, which keeps schemas like `asyncIteratorObject` wrapping each other.
     */
    if (!procedure['~orpc'].disableInputValidation) {
      for (let i = startInputIndex; i < endInputIndex; i++) {
        const validated = await validateInput(
          i,
          inputSchemas[i]!,
          i !== 0 ? mergeTwoLevels(options.input, currentInput) : currentInput,
        )

        currentInput = i !== 0 ? mergeTwoLevels(currentInput, validated) : validated
      }

      middlewareInput = endInputIndex > 0 && endInputIndex < inputSchemas.length
        ? mergeTwoLevels(options.input, currentInput)
        : currentInput
    }

    let currentOutput: unknown
    let currentContext = context

    if (midIndex < orderedMiddlewares.length) {
      const { middleware } = orderedMiddlewares[midIndex]!

      const result = await runWithSpan(`middleware.${middleware.name}`, async (span) => {
        span?.setAttribute('middleware.index', midIndex)

        return await middleware(
          {
            ...options,
            context,
            next: (...rest) => {
              const nextOptions = resolveMaybeOptionalOptions(rest)
              // context can be undefined when all field is optional
              const nextContext = nextOptions.context ?? {} as any

              return next(
                midIndex + 1,
                { ...context, ...nextContext },
                currentInput,
              )
            },
            lastEventId: options.lastEventId,
          },
          middlewareInput,
          middlewareDone,
        )
      })

      currentOutput = result.output
      currentContext = { ...context, ...result.context }
    }
    else {
      currentOutput = await runWithSpan(
        'handler',
        () => procedure['~orpc'].handler({ ...options, context, input: currentInput }, currentInput),
      )
    }

    const startOutputIndex = midIndex === 0
      ? 0
      : orderedMiddlewares[midIndex - 1]!.outputSchemasLengthAtUse ?? 0
    const endOutputIndex = midIndex === orderedMiddlewares.length
      ? outputSchemas.length
      : orderedMiddlewares[midIndex]!.outputSchemasLengthAtUse ?? 0

    if (!procedure['~orpc'].disableOutputValidation) {
      for (let i = endOutputIndex - 1; i >= startOutputIndex; i--) {
        currentOutput = await validateOutput(i, outputSchemas[i]!, currentOutput)
      }
    }

    return { output: currentOutput, context: currentContext }
  }

  const { output } = await next(0, options.context, options.input)
  return output
}
