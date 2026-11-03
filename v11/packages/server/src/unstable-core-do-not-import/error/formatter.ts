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
 * What an error formatter gets.
 * @see https://trpc.io/docs/server/error-formatting#all-properties-sent-to-errorformatter
 * @internal
 */
export interface ErrorFormatterOptions<TContext> {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  /** The procedure's path, if the error came from one. */
  path: string | undefined;
  input: unknown;
  /** The context, if it was created before the error. */
  ctx: TContext;
  /** The shape tRPC sends by default, to extend or replace. */
  shape: DefaultErrorShape;
}

/**
 * Shapes the errors a router sends to the client.
 * @see https://trpc.io/docs/server/error-formatting
 * @internal
 */
export type ErrorFormatter<TContext, TShape extends TRPCErrorShape> = (
  opts: ErrorFormatterOptions<TContext | undefined>,
) => TShape;

/**
 * An error formatter for one procedure, as `.errors()` takes it. Return
 * `undefined` to leave the error to the next formatter.
 * @see https://trpc.io/docs/server/error-formatting#per-procedure-error-formatting
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
 * The `data` of the default error shape.
 * @internal
 */
export type DefaultErrorData = {
  code: TRPC_ERROR_CODE_KEY;
  httpStatus: number;
  /**
   * The path of the procedure that threw.
   */
  path?: string;
  /**
   * The error's stack trace, only when `isDev` is set.
   */
  stack?: string;
};

/**
 * The error shape tRPC sends when there's no error formatter.
 * @see https://trpc.io/docs/server/error-formatting
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

const formattedShapeSymbol = Symbol('trpc_formattedErrorShape');

/**
 * @internal
 */
export function setFormattedErrorShape(
  error: TRPCError,
  shape: TRPCErrorShape,
): asserts error is TRPCError & { [formattedShapeSymbol]: TRPCErrorShape } {
  Object.defineProperty(error, formattedShapeSymbol, {
    value: shape,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

/**
 * @internal
 */
export function getFormattedErrorShape(
  error: TRPCError,
): TRPCErrorShape | undefined {
  if (isFormattedErrorShape(error)) {
    return error[formattedShapeSymbol];
  }

  return undefined;
}

export function isFormattedErrorShape(
  error: TRPCError,
): error is TRPCError & { [formattedShapeSymbol]: TRPCErrorShape } {
  return formattedShapeSymbol in error;
}
