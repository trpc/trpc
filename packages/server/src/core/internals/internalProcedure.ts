/**
 * This is the actual internal representation of a builder
 * FIXME - I want to get rid of this and use the public API instead
 */
import { TRPCError } from '../../TRPCError';
import { getCauseFromUnknown } from '../../error/utils';
import { getErrorFromUnknown } from '../../internals/errors';
import { MaybePromise } from '../../types';
import { MiddlewareFunction, MiddlewareResult } from '../middleware';
import { Parser } from '../parser';
import { ProcedureType } from '../types';
import { ParseFn, getParseFn } from './getParseFn';
import { mergeWithoutOverrides } from './mergeWithoutOverrides';
import { ResolveOptions, middlewareMarker } from './utils';

export interface InternalProcedureCallOptions {
  ctx: unknown;
  rawInput: unknown;
  input?: unknown;
  path: string;
  type: ProcedureType;
}
export interface InternalProcedure {
  _def: ProcedureBuilderInternal['_def'];
  /**
   * @deprecated use `._def.meta` instead
   */
  meta: ProcedureBuilderInternal['_def']['meta'];
  (opts: InternalProcedureCallOptions): Promise<unknown>;
}

type ProcedureBuilderInternalResolver = (
  opts: ResolveOptions<any>,
) => Promise<unknown>;

export type ProcedureBuilderInternalMiddleware = MiddlewareFunction<any, any>;
interface ProcedureBuilderInternal {
  _def: {
    input?: Parser;
    output?: Parser;
    meta?: Record<string, unknown>;
    resolver?: ProcedureBuilderInternalResolver;
    middlewares: ProcedureBuilderInternalMiddleware[];
  };
  // FIXME
  // _call: (opts: ResolveOptions<any>) => Promise<unknown>;
  /**
   * @internal
   */
  input: (parser: Parser) => ProcedureBuilderInternal;
  /**
   * @internal
   */
  output: (parser: Parser) => ProcedureBuilderInternal;
  /**
   * @internal
   */
  concat: (proc: ProcedureBuilderInternal) => ProcedureBuilderInternal;
  /**
   * @internal
   */
  use: (fn: MiddlewareFunction<any, any>) => ProcedureBuilderInternal;
  /**
   * @internal
   */
  meta: (meta: Record<string, unknown>) => ProcedureBuilderInternal;
  /**
   * @internal
   */
  resolve: (
    resolver: (opts: ResolveOptions<any>) => MaybePromise<any>,
  ) => InternalProcedure;
}
function createNewInternalBuilder(
  def1: ProcedureBuilderInternal['_def'],
  def2: Partial<ProcedureBuilderInternal['_def']>,
): ProcedureBuilderInternal {
  const { middlewares = [], ...rest } = def2;

  // TODO: maybe have a fn here to warn about calls
  return createInternalBuilder({
    ...mergeWithoutOverrides(def1, rest),
    middlewares: [...def1.middlewares, ...middlewares],
  });
}

const codeblock = `
const caller = appRouter.createCaller({
  /* ... your context */
});

const result = await caller.call('myProcedure', input);
`.trim();

function createProcedureCaller(
  _def: InternalProcedure['_def'],
): InternalProcedure {
  const procedure = async function resolve(opts: InternalProcedureCallOptions) {
    if (!opts || !('rawInput' in opts)) {
      const error = [
        'This is a client-only function.',
        'If you want to call this function on the server, you do the following:',
        codeblock,
      ];
      throw new Error(error.join('\n'));
    }

    // run the middlewares recursively with the resolver as the last one
    const callRecursive = async (
      callOpts: { ctx: any; index: number; input?: unknown } = {
        index: 0,
        ctx: opts.ctx,
      },
    ): Promise<MiddlewareResult<any>> => {
      try {
        const middleware = _def.middlewares[callOpts.index];
        const result = await middleware({
          ctx: callOpts.ctx,
          type: opts.type,
          path: opts.path,
          rawInput: opts.rawInput,
          meta: _def.meta,
          input: callOpts.input,
          next: async (nextOpts?: { ctx: any; input?: any }) => {
            return await callRecursive({
              index: callOpts.index + 1,
              ctx: nextOpts && 'ctx' in nextOpts ? nextOpts.ctx : callOpts.ctx,
              input:
                nextOpts && 'input' in nextOpts
                  ? nextOpts.input
                  : callOpts.input,
            });
          },
        });
        return result;
      } catch (cause) {
        return {
          ok: false,
          error: getErrorFromUnknown(cause),
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
    return result.data;
  };
  procedure._def = _def;
  procedure.meta = _def.meta;

  return procedure;
}

export function createInputMiddleware<T>(
  parse: ParseFn<T>,
): ProcedureBuilderInternalMiddleware {
  return async function inputMiddleware({ next, rawInput }) {
    let input: ReturnType<typeof parse>;
    try {
      input = await parse(rawInput);
    } catch (cause) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        cause: getCauseFromUnknown(cause),
      });
    }
    // TODO fix this typing?
    return next({ input } as any);
  };
}

export function createOutputMiddleware<T>(
  parse: ParseFn<T>,
): ProcedureBuilderInternalMiddleware {
  return async function outputMiddleware({ next }) {
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
        cause: getCauseFromUnknown(cause),
      });
    }
  };
}

export function createInternalBuilder(
  initDef?: ProcedureBuilderInternal['_def'],
): ProcedureBuilderInternal {
  const _def: ProcedureBuilderInternal['_def'] = initDef || {
    middlewares: [],
  };

  return {
    _def,
    // _call: createProcedureCaller(_def),
    input(input: Parser) {
      const parser = getParseFn(input);
      return createNewInternalBuilder(_def, {
        input,
        middlewares: [createInputMiddleware(parser)],
      });
    },
    output(output: Parser) {
      const parseOutput = getParseFn(output);
      return createNewInternalBuilder(_def, {
        output,
        middlewares: [createOutputMiddleware(parseOutput)],
      });
    },
    meta(meta) {
      return createNewInternalBuilder(_def, { meta });
    },
    resolve(resolver) {
      const finalBuilder = createNewInternalBuilder(_def, {
        resolver,
        middlewares: [
          async function resolveMiddleware(opts) {
            const data = await resolver(opts);
            return {
              marker: middlewareMarker,
              ok: true,
              data,
              ctx: opts.ctx,
            } as const;
          },
        ],
      });

      return createProcedureCaller(finalBuilder._def);
    },
    concat(builder) {
      return createNewInternalBuilder(_def, builder._def);
    },
    use(middleware) {
      return createNewInternalBuilder(_def, {
        middlewares: [middleware],
      });
    },
  };
}
