import { TRPCError, getTRPCErrorFromUnknown } from '../../error/TRPCError';
import { getCauseFromUnknown } from '../../error/utils';
import { InferLast } from '../../types';
import { ProcedureType } from '../router';
import {
  MiddlewareFunction,
  MiddlewareResult,
  middlewareMarker,
} from './middlewares';

export type ProcedureParserZodEsque<TInput, TOutput> = {
  _input: TInput;
  _output: TOutput;
};

export type ProcedureParserMyZodEsque<TType> = {
  parse: (input: any) => TType;
};

export type ProcedureParserSuperstructEsque<TType> = {
  create: (input: unknown) => TType;
};

export type ProcedureParserCustomValidatorEsque<TType> = (
  input: unknown,
) => TType | Promise<TType>;

export type ProcedureParserYupEsque<TType> = {
  validateSync: (input: unknown) => TType;
};

export type ProcedureParserWithInputOutput<TInput, TOutput> =
  ProcedureParserZodEsque<TInput, TOutput>;

export type ProcedureParser<TType> =
  | ProcedureParserYupEsque<TType>
  | ProcedureParserSuperstructEsque<TType>
  | ProcedureParserCustomValidatorEsque<TType>
  | ProcedureParserMyZodEsque<TType>;

export type ProcedureResolver<TContext, TInput, TOutput> = (opts: {
  ctx: TContext;
  input: TInput;
  type: ProcedureType;
}) => Promise<TOutput> | TOutput;

interface ProcedureOptions<TContext, TMeta, TInput, TOutput, TParsedOutput> {
  middlewares: Array<MiddlewareFunction<any, any, any>>;
  resolver: ProcedureResolver<TContext, TInput, TOutput>;
  inputParser: ProcedureParser<TInput>;
  outputParser: ProcedureParser<TParsedOutput>;
  meta: TMeta;
}

/**
 * @internal
 * @deprecated
 */
export interface ProcedureCallOptions<TContext> {
  ctx: TContext;
  rawInput: unknown;
  path: string;
  type: ProcedureType;
}

type ParseFn<TType> = (value: unknown) => TType | Promise<TType>;

function getParseFn<TType>(
  procedureParser: ProcedureParser<TType>,
): ParseFn<TType> {
  const parser = procedureParser as any;

  if (typeof parser === 'function') {
    // ProcedureParserCustomValidatorEsque
    return parser;
  }

  if (typeof parser.parseAsync === 'function') {
    // ProcedureParserZodEsque
    return parser.parseAsync.bind(parser);
  }

  if (typeof parser.parse === 'function') {
    // ProcedureParserZodEsque
    return parser.parse.bind(parser);
  }

  if (typeof parser.validateSync === 'function') {
    // ProcedureParserYupEsque
    return parser.validateSync.bind(parser);
  }

  if (typeof parser.create === 'function') {
    // ProcedureParserSuperstructEsque
    return parser.create.bind(parser);
  }

  throw new Error('Could not find a validator fn');
}

/**
 * @internal
 * @deprecated
 */
export class Procedure<
  TInputContext,
  TContext,
  TMeta,
  TInput,
  TParsedInput,
  TOutput,
  TParsedOutput,
  TFinalOutput = unknown extends TParsedOutput ? TOutput : TParsedOutput,
> {
  private middlewares: Readonly<Array<MiddlewareFunction<any, any, any>>>;
  private resolver: ProcedureResolver<TContext, TParsedInput, TOutput>;
  private readonly inputParser: ProcedureParser<TParsedInput>;
  private parseInputFn: ParseFn<TParsedInput>;
  private readonly outputParser: ProcedureParser<TFinalOutput>;
  private parseOutputFn: ParseFn<TFinalOutput>;
  public readonly meta: TMeta;

  constructor(
    opts: ProcedureOptions<
      TContext,
      TMeta,
      TParsedInput,
      TOutput,
      TFinalOutput
    >,
  ) {
    this.middlewares = opts.middlewares;
    this.resolver = opts.resolver;
    this.inputParser = opts.inputParser;
    this.parseInputFn = getParseFn(this.inputParser);
    this.outputParser = opts.outputParser;
    this.parseOutputFn = getParseFn(this.outputParser);
    this.meta = opts.meta;
  }

  public _def() {
    return {
      middlewares: this.middlewares,
      resolver: this.resolver,
      inputParser: this.inputParser,
      outputParser: this.outputParser,
      meta: this.meta,
    };
  }

  private async parseInput(rawInput: unknown): Promise<TParsedInput> {
    try {
      return await this.parseInputFn(rawInput);
    } catch (cause) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        cause: getCauseFromUnknown(cause),
      });
    }
  }

  private async parseOutput(rawOutput: TOutput): Promise<TFinalOutput> {
    try {
      return await this.parseOutputFn(rawOutput);
    } catch (cause) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        cause: getCauseFromUnknown(cause),
        message: 'Output validation failed',
      });
    }
  }

  /**
   * Trigger middlewares in order, parse raw input, call resolver & parse raw output
   * @internal
   */
  public async call(
    opts: ProcedureCallOptions<TInputContext>,
  ): Promise<TFinalOutput> {
    // wrap the actual resolver and treat as the last "middleware"
    const middlewaresWithResolver = this.middlewares.concat([
      async ({ ctx }: { ctx: any }) => {
        const input = await this.parseInput(opts.rawInput);
        const rawOutput = await this.resolver({
          ...opts,
          ctx,
          input,
        });
        const data = await this.parseOutput(rawOutput);
        return {
          marker: middlewareMarker,
          ok: true,
          data,
          ctx,
        } as const;
      },
    ]);

    // run the middlewares recursively with the resolver as the last one
    const callRecursive = async (
      callOpts: { ctx: any; index: number } = {
        index: 0,
        ctx: opts.ctx,
      },
    ): Promise<MiddlewareResult<any>> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const result = await middlewaresWithResolver[callOpts.index]!({
          ctx: callOpts.ctx,
          type: opts.type,
          path: opts.path,
          rawInput: opts.rawInput,
          meta: this.meta,
          next: async (nextOpts?: { ctx: any }) => {
            return await callRecursive({
              index: callOpts.index + 1,
              ctx: nextOpts ? nextOpts.ctx : callOpts.ctx,
            });
          },
        });
        return result;
      } catch (cause) {
        return {
          ctx: callOpts.ctx,
          ok: false,
          error: getTRPCErrorFromUnknown(cause),
          marker: middlewareMarker,
        };
      }
    };

    // there's always at least one "next" since we wrap this.resolver in a middleware
    const result = await callRecursive();
    if (!result) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'No result from middlewares - did you forget to `return next()`?',
      });
    }
    if (!result.ok) {
      // re-throw original error
      throw result.error;
    }

    return result.data as TFinalOutput;
  }

  /**
   * Create new procedure with passed middlewares
   * @param middlewares
   */
  public inheritMiddlewares(
    middlewares: MiddlewareFunction<TInputContext, TContext, TMeta>[],
  ): this {
    const Constructor: {
      new (
        opts: ProcedureOptions<
          TContext,
          TMeta,
          TParsedInput,
          TOutput,
          TFinalOutput
        >,
      ): Procedure<
        TInputContext,
        TContext,
        TMeta,
        TInput,
        TParsedInput,
        TOutput,
        TParsedOutput
      >;
    } = (this as any).constructor;

    const instance = new Constructor({
      middlewares: [...middlewares, ...this.middlewares],
      resolver: this.resolver,
      inputParser: this.inputParser,
      outputParser: this.outputParser,
      meta: this.meta,
    });

    return instance as any;
  }
}

export type CreateProcedureWithInput<TContext, TMeta, TInput, TOutput> = {
  input: ProcedureParser<TInput>;
  output?: ProcedureParser<TOutput>;
  meta?: TMeta;
  resolve: ProcedureResolver<TContext, TInput, InferLast<TOutput>>;
};

export type CreateProcedureWithInputOutputParser<
  TContext,
  TMeta,
  TInput,
  TParsedInput,
  TOutput,
  TParsedOutput,
> = {
  input: ProcedureParserWithInputOutput<TInput, TParsedInput>;
  output?: ProcedureParserWithInputOutput<TOutput, TParsedOutput>;
  meta?: TMeta;
  resolve: ProcedureResolver<TContext, TParsedInput, InferLast<TOutput>>;
};

export type CreateProcedureWithoutInput<
  TContext,
  TMeta,
  TOutput,
  TParsedOutput,
> = {
  output?:
    | ProcedureParserWithInputOutput<TOutput, TParsedOutput>
    | ProcedureParser<TOutput>;
  meta?: TMeta;
  resolve: ProcedureResolver<TContext, undefined, InferLast<TOutput>>;
};

export type CreateProcedureOptions<
  TContext,
  TMeta = undefined,
  TInput = undefined,
  TParsedInput = undefined,
  TOutput = undefined,
  TParsedOutput = undefined,
> =
  | CreateProcedureWithInputOutputParser<
      TContext,
      TMeta,
      TInput,
      TParsedInput,
      TOutput,
      TParsedOutput
    >
  | CreateProcedureWithInput<TContext, TMeta, TInput, TOutput>
  | CreateProcedureWithoutInput<TContext, TMeta, TOutput, TParsedOutput>;

export function createProcedure<
  TContext,
  TMeta,
  TInput,
  TParsedInput,
  TOutput,
  TParsedOutput,
>(
  opts: CreateProcedureOptions<
    TContext,
    TMeta,
    TInput,
    TParsedInput,
    TOutput,
    TParsedOutput
  >,
): Procedure<
  unknown,
  TContext,
  TMeta,
  TInput,
  TParsedInput,
  TOutput,
  TParsedOutput
> {
  const inputParser =
    'input' in opts
      ? opts.input
      : (input: unknown) => {
          if (input != null) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'No input expected',
            });
          }
          return undefined;
        };

  const outputParser =
    'output' in opts && opts.output
      ? opts.output
      : (output: unknown) => output as TOutput;

  return new Procedure({
    inputParser: inputParser as any,
    resolver: opts.resolve as any,
    middlewares: [],
    outputParser: outputParser as any,
    meta: opts.meta as any,
  });
}

export type inferProcedureFromOptions<
  TInputContext,
  TOptions extends CreateProcedureOptions<any, any, any, any, any, any>,
> = TOptions extends CreateProcedureOptions<
  infer TContext,
  infer TMeta,
  infer TInput,
  infer TParsedInput,
  infer TOutput,
  infer TParsedOutput
>
  ? Procedure<
      TInputContext,
      TContext,
      TMeta,
      unknown extends TInput ? undefined : TInput,
      unknown extends TParsedInput ? undefined : TParsedInput,
      TOutput,
      TParsedOutput
    >
  : never;
