/* eslint-disable @typescript-eslint/no-explicit-any */
import { assertNotBrowser } from '../assertNotBrowser';
import { ProcedureType } from '../router';
import { TRPCError } from '../TRPCError';
import { getErrorFromUnknown } from './errors';
import { MiddlewareFunction, middlewareMarker } from './middlewares';
import { wrapCallSafe } from './wrapCallSafe';
assertNotBrowser();

export type ProcedureParserZodEsque<TInput, TOutput> = {
  _input: TInput;
  _output: TOutput;
};

export type ProcedureParserMyZodEsque<T> = {
  parse: (input: any) => T;
};

export type ProcedureParserSuperstructEsque<T> = {
  create: (input: unknown) => T;
};

export type ProcedureParserCustomValidatorEsque<T> = (
  input: unknown,
) => T | Promise<T>;

export type ProcedureParserYupEsque<T> = {
  validateSync: (input: unknown) => T;
};

export type ProcedureParser<T> =
  | ProcedureParserYupEsque<T>
  | ProcedureParserSuperstructEsque<T>
  | ProcedureParserCustomValidatorEsque<T>
  | ProcedureParserMyZodEsque<T>;

export type ProcedureParserWithInputOutput<TInput, TOutput> =
  ProcedureParserZodEsque<TInput, TOutput>;

export type ProcedureResolver<TContext, TParsedInput, TOutput> = (opts: {
  ctx: TContext;
  input: TParsedInput;
  type: ProcedureType;
}) => Promise<TOutput> | TOutput;

interface ProcedureOptions<TContext, TParsedInput, TOutput> {
  middlewares: Array<MiddlewareFunction<any, any>>;
  resolver: ProcedureResolver<TContext, TParsedInput, TOutput>;
  inputParser: ProcedureParser<TParsedInput>;
  outputParser: ProcedureParser<TOutput>;
}

/**
 * @internal
 */
export interface ProcedureCallOptions<TContext> {
  ctx: TContext;
  rawInput: unknown;
  path: string;
  type: ProcedureType;
}

type ParseFn<T> = (value: unknown) => T | Promise<T>;

function getParseFn<T>(procedureParser: ProcedureParser<T>): ParseFn<T> {
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
 */
export class Procedure<
  TInputContext,
  TContext,
  TInput,
  TParsedInput,
  TOutput,
  TParsedOutput,
> {
  private middlewares: Readonly<Array<MiddlewareFunction<any, any>>>;
  private resolver: ProcedureResolver<TContext, TParsedInput, TOutput>;
  private readonly inputParser: ProcedureParser<TParsedInput>;
  private parseInputFn: ParseFn<TParsedInput>;
  private readonly outputParser: ProcedureParser<TOutput>;
  private parseOutputFn: ParseFn<TOutput>;

  constructor(opts: ProcedureOptions<TContext, TParsedInput, TOutput>) {
    this.middlewares = opts.middlewares;
    this.resolver = opts.resolver;
    this.inputParser = opts.inputParser;
    this.parseInputFn = getParseFn(this.inputParser);
    this.outputParser = opts.outputParser;
    this.parseOutputFn = getParseFn(this.outputParser);
  }

  private async parseInput(rawInput: unknown): Promise<TParsedInput> {
    try {
      return await this.parseInputFn(rawInput);
    } catch (cause) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        cause,
      });
    }
  }

  private async parseOutput(rawOutput: unknown): Promise<TOutput> {
    try {
      if (process.env.TRPC_SKIP_OUTPUT_VALIDATION) {
        return rawOutput as TOutput;
      }
      return await this.parseOutputFn(rawOutput);
    } catch (cause) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        cause,
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
  ): Promise<TOutput> {
    // wrap the actual resolver and treat as the last "middleware"
    const middlewaresWithResolver = this.middlewares.concat([
      async ({ ctx }: { ctx: TContext }) => {
        const input = await this.parseInput(opts.rawInput);
        const rawOutput = await this.resolver({ ...opts, ctx, input });
        const data = await this.parseOutput(rawOutput);
        return {
          marker: middlewareMarker,
          ok: true,
          data,
          ctx,
        } as const;
      },
    ]);

    // create `next()` calls in resolvers
    const nextFns = middlewaresWithResolver.map((fn, index) => {
      return async (nextOpts?: { ctx: TContext }) => {
        const res = await wrapCallSafe(() =>
          fn({
            ctx: nextOpts ? nextOpts.ctx : opts.ctx,
            type: opts.type,
            path: opts.path,
            rawInput: opts.rawInput,
            next: nextFns[index + 1],
          }),
        );
        if (res.ok) {
          return res.data;
        }
        return {
          ok: false as const,
          error: getErrorFromUnknown(res.error),
        };
      };
    });

    // there's always at least one "next" since we wrap this.resolver in a middleware
    const result = await nextFns[0]();
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

    return result.data as TOutput;
  }

  /**
   * Create new procedure with passed middlewares
   * @param middlewares
   */
  public inheritMiddlewares(
    middlewares: MiddlewareFunction<TInputContext, TContext>[],
  ): this {
    const Constructor: {
      new (opts: ProcedureOptions<TContext, TParsedInput, TOutput>): Procedure<
        TInputContext,
        TContext,
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
    });

    return instance as any;
  }
}

export type CreateProcedureWithInput<TContext, TInput, TOutput> = {
  input: ProcedureParser<TInput>;
  output?: ProcedureParser<TOutput>;
  resolve: ProcedureResolver<TContext, TInput, TOutput>;
};

export type CreateProcedureWithInputOutputParser<
  TContext,
  TInput,
  TParsedInput,
  TOutput,
  TParsedOutput,
> = {
  input: ProcedureParserWithInputOutput<TInput, TParsedInput>;
  output?: ProcedureParserWithInputOutput<TParsedOutput, TOutput>;
  resolve: ProcedureResolver<
    TContext,
    TParsedInput,
    unknown extends TParsedOutput ? TOutput : TParsedOutput
  >;
};

export type CreateProcedureWithoutInput<TContext, TOutput, TParsedOutput> = {
  output?:
    | ProcedureParserWithInputOutput<TParsedOutput, TOutput>
    | ProcedureParser<TOutput>;
  resolve: ProcedureResolver<
    TContext,
    undefined,
    unknown extends TParsedOutput ? TOutput : TParsedOutput
  >;
};

export type CreateProcedureOptions<
  TContext,
  TInput = undefined,
  TParsedInput = undefined,
  TOutput = undefined,
  TParsedOutput = undefined,
> =
  | CreateProcedureWithInputOutputParser<
      TContext,
      TInput,
      TParsedInput,
      TOutput,
      TParsedOutput
    >
  | CreateProcedureWithInput<TContext, TInput, TOutput>
  | CreateProcedureWithoutInput<TContext, TOutput, TParsedOutput>;

export function createProcedure<
  TContext,
  TInput,
  TParsedInput,
  TOutput,
  TParsedOutput,
>(
  opts: CreateProcedureOptions<
    TContext,
    TInput,
    TParsedInput,
    TOutput,
    TParsedOutput
  >,
): Procedure<unknown, TContext, TInput, TParsedInput, TOutput, TParsedOutput> {
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
  });
}

export type inferProcedureFromOptions<
  TInputContext,
  TOptions extends CreateProcedureOptions<any, any, any, any, any>,
> = TOptions extends CreateProcedureOptions<
  infer TContext,
  infer TInput,
  infer TParsedInput,
  infer TOutput,
  infer TParsedOutput
>
  ? Procedure<
      TInputContext,
      TContext,
      unknown extends TInput ? undefined : TInput,
      unknown extends TParsedInput ? undefined : TParsedInput,
      TOutput,
      TParsedOutput
    >
  : never;
