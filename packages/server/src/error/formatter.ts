import type { ProcedureType } from '../core';
import type {
  TRPC_ERROR_CODE_KEY,
  TRPC_ERROR_CODE_NUMBER,
  TRPCErrorShape,
} from '../rpc';
import type { TRPCError } from './TRPCError';

/**
 * @internal
 */
export type ErrorFormatter<TContext, TShape extends TRPCErrorShape<number>> = ({
  error,
}: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: TContext | undefined;
  shape: DefaultErrorShape;
}) => TShape;

export type ErrorFormatterShape<TType> = TType extends ErrorFormatter<
  any,
  infer TShape
>
  ? TShape
  : DefaultErrorShape;
/**
 * @internal
 */
export type DefaultErrorData = {
  code: TRPC_ERROR_CODE_KEY;
  httpStatus: number;
  path?: string;
  stack?: string;
};

/**
 * @internal
 */
export interface DefaultErrorShape
  extends TRPCErrorShape<TRPC_ERROR_CODE_NUMBER, DefaultErrorData> {
  message: string;
  code: TRPC_ERROR_CODE_NUMBER;
}

export const defaultFormatter: ErrorFormatter<any, any> = ({
  shape,
}: {
  shape: DefaultErrorShape;
}) => {
  return shape;
};
