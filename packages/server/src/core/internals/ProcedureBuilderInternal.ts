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
import { Procedure } from '../procedure';


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
  ) => (opts: {ctx: Record<string, unknown>, rawInput: unknown}) => unknown;
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
const myContext = {};
const caller = appRouter.createCaller(myContext);

const result = await caller.call('myProcedure', input);
`.trim();
/**
 * @internal
 */

function createProcedureCaller(_def: ProcedureBuilderInternal['_def']) {
  
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
      const completed = createNewInternalBuilder(_def, {
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
      return async (opts) => {
        if (!opts.ctx) {
          const error = [
            'This is a client-only function.',
            'If you want to call this function on the server, you do the following:',
            codeblock,
          ];
          throw new Error(error.join('\n'));
        }
      }
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
