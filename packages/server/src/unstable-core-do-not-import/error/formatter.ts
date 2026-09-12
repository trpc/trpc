import type { ProcedureType } from '../procedure';
import type {
  TRPC_ERROR_CODE_KEY,
  TRPC_ERROR_CODE_NUMBER,
  TRPCErrorShape,
} from '../rpc';
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
> = (opts: ErrorFormatterOptions<TContext>) => TShape;

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

const errorFormattersSymbol = Symbol('trpc_errorFormatters');

/**
 * Carry the `.errors()` handlers an error bubbled through across the `throw`
 * that leaves the middleware chain, so {@link getErrorShape} can run them.
 * @internal
 */
export function setProcedureErrorFormatters(
  error: TRPCError,
  formatters: AnyProcedureErrorFormatter[],
): void {
  Object.defineProperty(error, errorFormattersSymbol, {
    value: formatters,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

/**
 * Subscriptions fail during iteration, once the middleware chain has already
 * unwound, so those handlers are collected onto the error one at a time.
 * @internal
 */
export function addProcedureErrorFormatter(
  error: TRPCError,
  formatter: AnyProcedureErrorFormatter,
): void {
  setProcedureErrorFormatters(error, [
    ...getProcedureErrorFormatters(error),
    formatter,
  ]);
}

/**
 * @internal
 */
export function getProcedureErrorFormatters(
  error: TRPCError,
): AnyProcedureErrorFormatter[] {
  return (
    (error as { [errorFormattersSymbol]?: AnyProcedureErrorFormatter[] })[
      errorFormattersSymbol
    ] ?? []
  );
}
