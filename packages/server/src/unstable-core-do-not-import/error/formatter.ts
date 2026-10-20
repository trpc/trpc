import { getHTTPStatusCodeFromError } from '../http/getHTTPStatusCode';
import type { ProcedureType } from '../procedure';
import type {
  TRPC_ERROR_CODE_KEY,
  TRPC_ERROR_CODE_NUMBER,
  TRPCErrorShape,
} from '../rpc';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import type { Overwrite, Simplify } from '../types';
import type { TRPCError } from './TRPCError';

/**
 * @internal
 */
export interface ErrorFormatterOptions<TContext> {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: TContext;
  shape: DefaultErrorShape;
}

/**
 * @internal
 */
export type ErrorFormatter<TContext, TShape extends TRPCErrorShape> = (
  opts: ErrorFormatterOptions<TContext | undefined>,
) => TShape;

/**
 * @internal
 */
export type ProcedureErrorFormatter<
  TContext,
  TContextOverrides,
  TShape extends TRPCErrorShape | undefined | void,
> = (
  opts: ErrorFormatterOptions<Simplify<Overwrite<TContext, TContextOverrides>>>,
) => TShape;

/**
 * @internal
 */
export type AnyProcedureErrorFormatter = ProcedureErrorFormatter<any, any, any>;

/**
 * @internal
 */
export type DefaultErrorData = {
  code: TRPC_ERROR_CODE_KEY;
  httpStatus: number;
  /**
   * Path to the procedure that threw the error
   */
  path?: string;
  /**
   * Stack trace of the error (only in development)
   */
  stack?: string;
};

/**
 * @internal
 */
export interface DefaultErrorShape extends TRPCErrorShape<DefaultErrorData> {
  message: string;
  code: TRPC_ERROR_CODE_NUMBER;
}

export const defaultFormatter: ErrorFormatter<any, any> = ({ shape }) => {
  return shape;
};

/**
 * @internal
 */
export function getDefaultErrorShape(opts: {
  error: TRPCError;
  path: string | undefined;
  isDev: boolean;
}): DefaultErrorShape {
  const shape: DefaultErrorShape = {
    message: opts.error.message,
    code: TRPC_ERROR_CODES_BY_KEY[opts.error.code],
    data: {
      code: opts.error.code,
      httpStatus: getHTTPStatusCodeFromError(opts.error),
    },
  };
  if (opts.isDev && typeof opts.error.stack === 'string') {
    shape.data.stack = opts.error.stack;
  }
  if (typeof opts.path === 'string') {
    shape.data.path = opts.path;
  }
  return shape;
}

/**
 * The shapes created by `.errors()` handlers during a single procedure call.
 *
 * These are kept per call rather than on the error, as the same error
 * instance can be thrown by several calls (e.g. from a DataLoader).
 * @internal
 */
export type FormattedErrorShapes = WeakMap<TRPCError, TRPCErrorShape>;
