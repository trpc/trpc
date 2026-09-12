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
 * The router-wide error formatter.
 * @internal
 */
export type ErrorFormatter<TContext, TShape extends TRPCErrorShape> = (
  opts: ErrorFormatterOptions<TContext>,
) => TShape;

/**
 * A procedure-level error formatter, added with `.errors()`.
 *
 * Returning `undefined` (or nothing) declines the error, handing it to the next
 * formatter towards the head of the chain and ultimately to the router-wide
 * `errorFormatter`.
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
