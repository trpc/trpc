/* eslint-disable @typescript-eslint/no-explicit-any */
import { TRPCError } from '../TRPCError';
import { assertNotBrowser } from '../assertNotBrowser';
import { ProcedureType } from '../router';
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

export type ProcedureParserWithInputOutput<TInput, TOutput> =
  ProcedureParserZodEsque<TInput, TOutput>;

export type ProcedureParser<T> =
  | ProcedureParserYupEsque<T>
  | ProcedureParserSuperstructEsque<T>
  | ProcedureParserCustomValidatorEsque<T>
  | ProcedureParserMyZodEsque<T>;

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

  private async parseOutput(rawOutput: TOutput): Promise<TFinalOutput> {
    try {
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
  ): Promise<TFinalOutput> {
    // wrap the actual resolver and treat as the last "middleware"
    const middlewaresWithResolver = this.middlewares.concat([
      async ({ ctx }: { ctx: TContext }) => {
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

    // create `next()` calls in resolvers
    const nextFns = middlewaresWithResolver.map((fn, index) => {
      return async (nextOpts?: { ctx: TContext }) => {
        const res = await wrapCallSafe(() =>
          fn({
            ctx: nextOpts ? nextOpts.ctx : opts.ctx,
            type: opts.type,
            path: opts.path,
            rawInput: opts.rawInput,
            meta: this.meta,
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
  resolve: ProcedureResolver<TContext, TInput, TOutput>;
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
  resolve: ProcedureResolver<TContext, TParsedInput, TOutput>;
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
  resolve: ProcedureResolver<TContext, undefined, TOutput>;
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
