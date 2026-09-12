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
export type ErrorFormatter<
  TContext,
  TShape extends TRPCErrorShape,
  /**
   * The shape that is passed *into* the formatter.
   * For the global formatter this is always the {@link DefaultErrorShape},
   * for procedure-level formatters it's whatever the previous formatter returned.
   */
  TShapeIn = DefaultErrorShape,
> = (opts: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: TContext | undefined;
  shape: TShapeIn;
}) => TShape;

/**
 * @internal
 */
export type AnyErrorFormatter = ErrorFormatter<any, any, any>;

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
