/**
 * This is the actual internal representation of a builder
 */
import { MaybePromise } from '../../types';
import { MiddlewareFunction } from '../middleware';
import { Parser } from '../parser';
import { ResolveOptions } from '../utils';

interface ProcedureBuilderInternal {
  _def: {
    input?: Parser;
    output?: Parser;
    meta?: Record<string, unknown>;
    resolver?: (opts: ResolveOptions<any>) => Promise<unknown>;
    middlewares: MiddlewareFunction<any, any>[];
  };
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
  resolve: (resolver: () => MaybePromise<any>) => ProcedureBuilderInternal;
}
/**
 * Ensures there are no duplicate keys when building a procedure.
 */
function mergeWithoutOverrides<T extends Record<string, unknown>>(
  obj1: T,
  obj2: Partial<T>,
): T {
  for (const key in obj2) {
    if (key in obj1) {
      throw new Error(`Duplicate key ${key}`);
    }
  }
  return {
    ...obj1,
    ...obj2,
  };
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
      'TODO - add explanation',
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
    input(input: Parser) {
      return createNewInternalBuilder(_def, { input });
    },
    output(output: Parser) {
      return createNewInternalBuilder(_def, { output });
    },
    meta(meta) {
      return createNewInternalBuilder(_def, { meta });
    },
    resolve(resolver) {
      return createNewInternalBuilder(_def, { resolver });
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
