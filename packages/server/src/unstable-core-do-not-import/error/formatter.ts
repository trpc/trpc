import { getHTTPStatusCodeFromError } from '../http/getHTTPStatusCode';
import type { ProcedureType } from '../procedure';
import type {
  TRPC_ERROR_CODE_KEY,
  TRPC_ERROR_CODE_NUMBER,
  TRPCErrorShape,
} from '../rpc';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import type { TRPCError } from './TRPCError';

/**
 * @internal
 */
export interface ErrorFormatterOptions<TContext> {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: TContext | undefined;
  shape: DefaultErrorShape;
}

/**
 * @internal
 */
export type ErrorFormatter<TContext, TShape extends TRPCErrorShape> = (
  opts: ErrorFormatterOptions<TContext>,
) => TShape;

/**
 * @internal
 */
export type ProcedureErrorFormatter<
  TContext,
  TShape extends TRPCErrorShape | undefined | void,
> = (
  opts: Omit<ErrorFormatterOptions<TContext>, 'ctx'> & { ctx: TContext },
) => TShape;

/**
 * @internal
 */
export type AnyProcedureErrorFormatter = ProcedureErrorFormatter<any, any>;

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
