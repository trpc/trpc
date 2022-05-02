/**
 * This is the actual internal representation of a builder
 */
import { TRPCError } from '../../TRPCError';
import { getCauseFromUnknown } from '../../error/utils';
import { MaybePromise } from '../../types';
import { MiddlewareFunction } from '../middleware';
import { Parser } from '../parser';
import { getParseFn } from './getParseFn';
import { mergeWithoutOverrides } from './mergeWithoutOverrides';
import { ResolveOptions, middlewareMarker } from './utils';

interface ProcedureBuilderInternal {
  _def: {
    input?: Parser;
    output?: Parser;
    meta?: Record<string, unknown>;
    resolver?: (opts: ResolveOptions<any>) => Promise<unknown>;
    middlewares: MiddlewareFunction<any, any>[];
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
  ) => ProcedureBuilderInternal;
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
/**
 * Wrap the builder in a function to block users from calling the builder directly.
 * From a usage point of view, it looks like you can call a procedure, when in fact you can't
 */
function wrapInternalBuilderInFn(
  result: ProcedureBuilderInternal,
): ProcedureBuilderInternal {
  const fn: ProcedureBuilderInternal = (() => {
    const error = [
      'This is a client-only function.',
      'If you want to call this function on the server, you must first wrap the function',
      'FIXME - add explanation',
    ];
    throw new Error(error.join('\n'));
  }) as any;

  for (const _key in result) {
    const key = _key as keyof ProcedureBuilderInternal;
    fn[key] = result[key] as any;
  }
  return fn;
}

/**
 * @internal
 */

export function createInternalBuilder(
  initDef?: ProcedureBuilderInternal['_def'],
): ProcedureBuilderInternal {
  const _def: ProcedureBuilderInternal['_def'] = initDef || {
    middlewares: [],
  };

  return wrapInternalBuilderInFn({
    _def,
    // _call: createProcedureCaller(_def),
    input(input: Parser) {
      const parseInput = getParseFn(input);
      return createNewInternalBuilder(_def, {
        input,
        middlewares: [
          ..._def.middlewares,
          async function inputMiddleware({ next, rawInput }) {
            let input: ReturnType<typeof parseInput>;
            try {
              input = await parseInput(rawInput);
            } catch (cause) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                cause: getCauseFromUnknown(cause),
              });
            }
            // TODO fix this typing?
            return next({ input } as any);
          },
        ],
      });
    },
    output(output: Parser) {
      const parseOutput = getParseFn(output);
      return createNewInternalBuilder(_def, {
        output,
        middlewares: [
          ..._def.middlewares,
          async function outputMiddleware({ next }) {
            const result = await next();
            if (!result.ok) {
              // pass through failures without validating
              return result;
            }
            try {
              await parseOutput(result.data);
            } catch (cause) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                cause: getCauseFromUnknown(cause),
              });
            }
            return result;
          },
        ],
      });
    },
    meta(meta) {
      return createNewInternalBuilder(_def, { meta });
    },
    resolve(resolver) {
      return createNewInternalBuilder(_def, {
        resolver,
        middlewares: [
          ..._def.middlewares,
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
    },
    concat(builder) {
      return createNewInternalBuilder(_def, builder._def);
    },
    use(middleware) {
      return createNewInternalBuilder(_def, {
        middlewares: [middleware],
      });
    },
  });
}
