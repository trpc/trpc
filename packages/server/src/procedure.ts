/* eslint-disable @typescript-eslint/no-explicit-any */
import { assertNotBrowser } from './assertNotBrowser';
import { ProcedureType } from './router';
import { MiddlewareFunction, middlewareMarker } from './internals/middlewares';
import { TRPCError } from './TRPCError';
import { getErrorFromUnknown } from './internals/errors';
assertNotBrowser();

export type ProcedureInputParserZodEsque<TInput = unknown> = {
  parse: (input: any) => TInput;
};

export type ProcedureInputParserCustomValidatorEsque<TInput = unknown> = (
  input: unknown,
) => TInput;

export type ProcedureInputParserYupEsque<TInput = unknown> = {
  validateSync: (input: unknown) => TInput;
};
export type ProcedureInputParser<TInput = unknown> =
  | ProcedureInputParserZodEsque<TInput>
  | ProcedureInputParserYupEsque<TInput>
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
  middlewares: MiddlewareFunction<TContext>[];
  resolver: ProcedureResolver<TContext, TInput, TOutput>;
  inputParser: ProcedureInputParser<TInput>;
}

export interface ProcedureCallOptions<TContext> {
  ctx: TContext;
  rawInput: unknown;
  path: string;
  type: ProcedureType;
}

type ParseFn<TInput> = (value: unknown) => TInput;
function getParseFn<TInput>(
  inputParser: ProcedureInputParser<TInput>,
): ParseFn<TInput> {
  const parser = inputParser as any;
  if (typeof parser === 'function') {
    return parser;
  }
  if (typeof parser.parse === 'function') {
    return parser.parse.bind(parser);
  }

  if (typeof parser.validateSync === 'function') {
    return parser.validateSync.bind(parser);
  }

  throw new Error('Could not find a validator fn');
}

type AsyncFn<T> = () => Promise<T> | T;
/**
 * Wrap a function in a safe wrapper that never throws
 * Returns a discriminated union
 */
async function wrapCallSafe<T>(fn: AsyncFn<T>) {
  try {
    const data = await fn();
    return {
      ok: true as const,
      data,
    };
  } catch (error: unknown) {
    return {
      ok: false as const,
      error,
    };
  }
}

export abstract class Procedure<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown,
> {
  private middlewares: Readonly<MiddlewareFunction<TContext>[]>;
  private resolver: ProcedureResolver<TContext, TInput, TOutput>;
  private readonly inputParser: ProcedureInputParser<TInput>;
  private parse: ParseFn<TInput>;

  constructor(opts: ProcedureOptions<TContext, TInput, TOutput>) {
    this.middlewares = opts.middlewares;
    this.resolver = opts.resolver;
    this.inputParser = opts.inputParser;
    this.parse = getParseFn(this.inputParser);
  }

  private parseInput(rawInput: unknown): TInput {
    try {
      return this.parse(rawInput);
    } catch (cause) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        cause,
      });
    }
  }

  /**
   * Trigger middlewares in order, parse raw input & call resolver
   */
  public async call(opts: ProcedureCallOptions<TContext>): Promise<TOutput> {
    // wrap the actual resolver and treat as the last "middleware"
    const middlewaresWithResolver = this.middlewares.concat([
      async () => {
        const input = this.parseInput(opts.rawInput);
        const data = await this.resolver({ ...opts, input });
        return {
          marker: middlewareMarker,
          ok: true,
          data,
        };
      },
    ]);

    // create `next()` calls in resolvers
    const nextFns = middlewaresWithResolver.map((fn, index) => {
      return async () => {
        const res = await wrapCallSafe(() =>
          fn({ ...opts, next: nextFns[index + 1] }),
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
  public inheritMiddlewares(middlewares: MiddlewareFunction<TContext>[]): this {
    const Constructor: {
      new (opts: ProcedureOptions<TContext, TInput, TOutput>): Procedure<
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

export class ProcedureWithoutInput<TContext, TOutput> extends Procedure<
  TContext,
  undefined,
  TOutput
> {}

export class ProcedureWithInput<TContext, TInput, TOutput> extends Procedure<
  TContext,
  TInput,
  TOutput
> {}

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

function isProcedureWithInput<TContext, TInput, TOutput>(
  opts: any,
): opts is CreateProcedureWithInput<TContext, TInput, TOutput> {
  return !!opts.input;
}
export function createProcedure<TContext, TInput, TOutput>(
  opts: CreateProcedureWithInput<TContext, TInput, TOutput>,
): ProcedureWithInput<TContext, TInput, TOutput>;
export function createProcedure<TContext, TOutput>(
  opts: CreateProcedureWithoutInput<TContext, TOutput>,
): ProcedureWithoutInput<TContext, TOutput>;
export function createProcedure<TContext, TInput, TOutput>(
  opts: CreateProcedureOptions<TContext, TInput, TOutput>,
): Procedure<TContext, TInput, TOutput>;
export function createProcedure<TContext, TInput, TOutput>(
  opts: CreateProcedureOptions<TContext, TInput, TOutput>,
) {
  if (isProcedureWithInput<TContext, TInput, TOutput>(opts)) {
    return new ProcedureWithInput({
      inputParser: opts.input,
      resolver: opts.resolve,
      middlewares: [],
    });
  }
  return new ProcedureWithoutInput({
    resolver: opts.resolve,
    middlewares: [],
    inputParser(input: unknown) {
      if (input != null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No input expected',
        });
      }
      return undefined;
    },
  });
}

export type inferProcedureFromOptions<
  TOptions extends CreateProcedureOptions<any, any, any>,
> = TOptions extends CreateProcedureWithInput<
  infer TContext,
  infer TInput,
  infer TOutput
>
  ? ProcedureWithInput<TContext, TInput, TOutput>
  : TOptions extends CreateProcedureWithoutInput<
      //
      infer TContext,
      infer TOutput
    >
  ? ProcedureWithoutInput<TContext, TOutput>
  : Procedure<unknown, unknown>;
