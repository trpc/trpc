/* eslint-disable @typescript-eslint/no-explicit-any */
import { assertNotBrowser } from '../assertNotBrowser';
import { ProcedureType } from '../router';
import { TRPCError } from '../TRPCError';
import { getErrorFromUnknown } from './errors';
import { MiddlewareFunction, middlewareMarker } from './middlewares';
import { wrapCallSafe } from './wrapCallSafe';
assertNotBrowser();

export type ProcedureInputParserZodEsque<TInput = unknown> =
  | {
      parse: (input: any) => TInput;
    }
  | {
      parseAsync: (input: any) => TInput;
    };

export type ProcedureInputParserSuperstructEsque<TInput = unknown> = {
  create: (input: unknown) => TInput;
};

export type ProcedureInputParserCustomValidatorEsque<TInput = unknown> = (
  input: unknown,
) => TInput | Promise<TInput>;

export type ProcedureInputParserYupEsque<TInput = unknown> = {
  validateSync: (input: unknown) => TInput;
};
export type ProcedureInputParser<TInput = unknown> =
  | ProcedureInputParserZodEsque<TInput>
  | ProcedureInputParserYupEsque<TInput>
  | ProcedureInputParserSuperstructEsque<TInput>
  | ProcedureInputParserCustomValidatorEsque<TInput>;

export type ProcedureResolver<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown,
> = (opts: {
  ctx: TContext;
  input: TInput;
  type: ProcedureType;
}) => Promise<TOutput> | TOutput;

interface ProcedureOptions<TContext, TInput, TOutput> {
  middlewares: Array<MiddlewareFunction<any, any>>;
  resolver: ProcedureResolver<TContext, TInput, TOutput>;
  inputParser: ProcedureInputParser<TInput>;
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

type ParseFn<TInput> = (value: unknown) => TInput | Promise<TInput>;
function getParseFn<TInput>(
  inputParser: ProcedureInputParser<TInput>,
): ParseFn<TInput> {
  const parser = inputParser as any;

  if (typeof parser === 'function') {
    // ProcedureInputParserCustomValidatorEsque
    return parser;
  }

  if (typeof parser.parseAsync === 'function') {
    // ProcedureInputParserZodEsque
    return parser.parseAsync.bind(parser);
  }

  if (typeof parser.parse === 'function') {
    // ProcedureInputParserZodEsque
    return parser.parse.bind(parser);
  }

  if (typeof parser.validateSync === 'function') {
    // ProcedureInputParserYupEsque
    return parser.validateSync.bind(parser);
  }

  if (typeof parser.create === 'function') {
    // ProcedureInputParserSuperstructEsque
    return parser.create.bind(parser);
  }

  throw new Error('Could not find a validator fn');
}

/**
 * @internal
 */
export class Procedure<TInputContext, TContext, TInput, TOutput> {
  private middlewares: Readonly<Array<MiddlewareFunction<any, any>>>;
  private resolver: ProcedureResolver<TContext, TInput, TOutput>;
  private readonly inputParser: ProcedureInputParser<TInput>;
  private parse: ParseFn<TInput>;

  constructor(opts: ProcedureOptions<TContext, TInput, TOutput>) {
    this.middlewares = opts.middlewares;
    this.resolver = opts.resolver;
    this.inputParser = opts.inputParser;
    this.parse = getParseFn(this.inputParser);
  }

  private async parseInput(rawInput: unknown): Promise<TInput> {
    try {
      return await this.parse(rawInput);
    } catch (cause) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        cause,
      });
    }
  }

  /**
   * Trigger middlewares in order, parse raw input & call resolver
   * @internal
   */
  public async call(
    opts: ProcedureCallOptions<TInputContext>,
  ): Promise<TOutput> {
    // wrap the actual resolver and treat as the last "middleware"
    const middlewaresWithResolver = this.middlewares.concat([
      async ({ ctx }: { ctx: TContext }) => {
        const input = await this.parseInput(opts.rawInput);
        const data = await this.resolver({ ...opts, ctx, input });
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
      new (opts: ProcedureOptions<TContext, TInput, TOutput>): Procedure<
        TInputContext,
        TContext,
        TInput,
        TOutput
      >;
    } = (this as any).constructor;

    const instance = new Constructor({
      middlewares: [...middlewares, ...this.middlewares],
      resolver: this.resolver,
      inputParser: this.inputParser,
    });

    return instance as any;
  }
}

export type CreateProcedureWithInput<TContext, TInput, TOutput> = {
  input: ProcedureInputParser<TInput>;
  resolve: ProcedureResolver<TContext, TInput, TOutput>;
};
export type CreateProcedureWithoutInput<TContext, TOutput> = {
  resolve: ProcedureResolver<TContext, undefined, TOutput>;
};

export type CreateProcedureOptions<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown,
> =
  | CreateProcedureWithInput<TContext, TInput, TOutput>
  | CreateProcedureWithoutInput<TContext, TOutput>;

export function createProcedure<TContext, TInput, TOutput>(
  opts: CreateProcedureOptions<TContext, TInput, TOutput>,
): Procedure<unknown, TContext, TInput, TOutput> {
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

  return new Procedure({
    inputParser: inputParser as any,
    resolver: opts.resolve as any,
    middlewares: [],
  });
}

export type inferProcedureFromOptions<
  TInputContext,
  TOptions extends CreateProcedureOptions<any, any, any>,
> = TOptions extends CreateProcedureOptions<
  infer TContext,
  infer TInput,
  infer TOutput
>
  ? Procedure<TInputContext, TContext, TInput, TOutput>
  : never;
