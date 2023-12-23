import { TRPCError } from '../error/TRPCError';
import { Simplify } from '../types';
import { ParseFn } from './internals/getParseFn';
import { GetRawInputFn, MiddlewareMarker, Overwrite } from './internals/utils';
import { ProcedureType } from './types';

/**
 * @internal
 */
interface MiddlewareResultBase {
  /**
   * All middlewares should pass through their `next()`'s output.
   * Requiring this marker makes sure that can't be forgotten at compile-time.
   */
  readonly marker: MiddlewareMarker;
}

/**
 * @internal
 */
interface MiddlewareOKResult<_TContextOverride> extends MiddlewareResultBase {
  ok: true;
  data: unknown;
  // this could be extended with `input`/`rawInput` later
}

/**
 * @internal
 */
interface MiddlewareErrorResult<_TContextOverride>
  extends MiddlewareResultBase {
  ok: false;
  error: TRPCError;
}

/**
 * @internal
 */
export type MiddlewareResult<_TContextOverride> =
  | MiddlewareErrorResult<_TContextOverride>
  | MiddlewareOKResult<_TContextOverride>;

// /**
//  * @internal
//  */
// export interface MiddlewareBuilder<
//   TConfig extends AnyRootConfig,
//   TConfig['$types']['ctx'],
//   TContextOverrides,
//   TInputIn,
//   TInputOut,
//   TOutputIn,
//   TOutputOut,
// > {
//   /**
//    * Create a new builder based on the current middleware builder
//    */
//   unstable_pipe<$Params extends AnyProcedureBuilderParams>(
//     fn: {
//       _config: TRoot['_config'];
//       _meta: TRoot['_meta'];
//       _ctx_out: Overwrite<TRoot['_ctx_out'], TNewParams['_ctx_out']>;
//       _input_in: DefaultValue<TRoot['_input_in'], TNewParams['_input_in']>;
//       _input_out: DefaultValue<TRoot['_input_out'], TNewParams['_input_out']>;
//       _output_in: DefaultValue<TRoot['_output_in'], TNewParams['_output_in']>;
//       _output_out: DefaultValue<
//         TRoot['_output_out'],
//         TNewParams['_output_out']
//       >;
//     } extends infer OParams extends AnyProcedureBuilderParams
//       ? MiddlewareBuilder<OParams, $Params>
//       : never,
//   ): CreateMiddlewareReturnInput<
//     TRoot,
//     TNewParams,
//     Overwrite<TNewParams, $Params>
//   >;

//   /**
//    * List of middlewares within this middleware builder
//    */
//   _middlewares: MiddlewareFunction<TRoot, TNewParams>[];
// }

// /**
//  * @internal
//  */
// type deriveParamsFromConfig<
//   TConfig extends AnyRootConfig,
//   TInputIn = unknown,
// > = {
//   _config: TConfig;
//   // eslint-disable-next-line @typescript-eslint/ban-types
//   _ctx_out: {};
//   _input_out: UnsetMarker;
//   _input_in: TInputIn;
//   _output_in: unknown;
//   _output_out: unknown;
//   _meta: TConfig['$types']['meta'];
// };
/**
 * @internal
 */
export type MiddlewareFunction<
  TContext,
  TMeta,
  TContextOverrides,
  TInputIn,
  _TInputOut,
  _TOutputIn,
  _TOutputOut,
  $ContextOverride,
> = {
  (opts: {
    ctx: Simplify<Overwrite<TContext, TContextOverrides>>;
    type: ProcedureType;
    path: string;
    input: TInputIn;
    getRawInput: GetRawInputFn;
    meta: TMeta | undefined;
    next: {
      (): Promise<MiddlewareResult<TContextOverrides>>;
      <$ContextOverride>(opts: {
        ctx?: $ContextOverride;
        input?: unknown;
      }): Promise<MiddlewareResult<$ContextOverride>>;
      (opts: { getRawInput: GetRawInputFn }): Promise<
        MiddlewareResult<TContextOverrides>
      >;
    };
  }): Promise<MiddlewareResult<$ContextOverride>>;
  _type?: string | undefined;
};

export type AnyMiddlewareFunction = MiddlewareFunction<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

// /**
//  * @internal
//  */
// export function createMiddlewareFactory<
//   TConfig extends AnyRootConfig,
//   TInputIn = unknown,
// >() {
//   function createMiddlewareInner<TNewParams extends AnyProcedureBuilderParams>(
//     middlewares: MiddlewareFunction<any, any>[],
//   ): MiddlewareBuilder<deriveParamsFromConfig<TConfig, TInputIn>, TNewParams> {
//     return {
//       _middlewares: middlewares,
//       unstable_pipe(middlewareBuilderOrFn) {
//         const pipedMiddleware =
//           '_middlewares' in middlewareBuilderOrFn
//             ? middlewareBuilderOrFn._middlewares
//             : [middlewareBuilderOrFn];

//         return createMiddlewareInner([
//           ...(middlewares as any),
//           ...pipedMiddleware,
//         ]);
//       },
//     };
//   }

//   function createMiddleware<TNewParams extends AnyProcedureBuilderParams>(
//     fn: MiddlewareFunction<
//       deriveParamsFromConfig<TConfig, TInputIn>,
//       TNewParams
//     >,
//   ): MiddlewareBuilder<deriveParamsFromConfig<TConfig, TInputIn>, TNewParams> {
//     return createMiddlewareInner([fn]);
//   }

//   return createMiddleware;
// }

// export const experimental_standaloneMiddleware = <
//   TCtx extends {
//     ctx?: object;
//     meta?: object;
//     input?: unknown;
//   },
// >() => ({
//   create: createMiddlewareFactory<
//     RootConfig<{
//       ctx: TCtx extends { ctx: infer T extends object } ? T : object;
//       meta: TCtx extends { meta: infer T extends object } ? T : object;
//       errorShape: object;
//       transformer: object;
//     }>,
//     TCtx extends { input: infer T } ? T : unknown
//   >(),
// });

function isPlainObject(obj: unknown) {
  return obj && typeof obj === 'object' && !Array.isArray(obj);
}

/**
 * @internal
 * Please note, `trpc-openapi` uses this function.
 */
export function createInputMiddleware<TInput>(parse: ParseFn<TInput>) {
  const inputMiddleware: AnyMiddlewareFunction = async (opts) => {
    let parsedInput: ReturnType<typeof parse>;

    const rawInput = await opts.getRawInput();
    try {
      parsedInput = await parse(rawInput);
    } catch (cause) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        cause,
      });
    }

    // Multiple input parsers
    const combinedInput =
      isPlainObject(opts.input) && isPlainObject(parsedInput)
        ? {
            ...opts.input,
            ...parsedInput,
          }
        : parsedInput;

    return opts.next({ input: combinedInput });
  };
  inputMiddleware._type = 'input';
  return inputMiddleware;
}

/**
 * @internal
 */
export function createOutputMiddleware<TOutput>(parse: ParseFn<TOutput>) {
  const outputMiddleware: AnyMiddlewareFunction = async ({ next }) => {
    const result = await next();
    if (!result.ok) {
      // pass through failures without validating
      return result;
    }
    try {
      const data = await parse(result.data);
      return {
        ...result,
        data,
      };
    } catch (cause) {
      throw new TRPCError({
        message: 'Output validation failed',
        code: 'INTERNAL_SERVER_ERROR',
        cause,
      });
    }
  };
  outputMiddleware._type = 'output';
  return outputMiddleware;
}
