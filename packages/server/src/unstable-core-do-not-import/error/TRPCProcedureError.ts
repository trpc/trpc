import type { TRPCErrorShape } from '../rpc';
import type { TRPCError } from './TRPCError';

/**
 * @deprecated prefer TRPCDeclaredError for fully typesafe error handling
 */
export const procedureErrorKeySymbol = Symbol('trpc.procedureErrorKey');

/**
 * @deprecated prefer TRPCDeclaredError for fully typesafe error handling
 */
export const procedureErrorShapeSymbol = Symbol('trpc.procedureErrorShape');

/**
 * @deprecated prefer TRPCDeclaredError for fully typesafe error handling
 */
export class TRPCProcedureError<
  TShape extends TRPCErrorShape = TRPCErrorShape,
> extends Error {
  public readonly shape: TShape;
  [procedureErrorKeySymbol]?: string;

  constructor(shape: TShape, opts?: { cause?: unknown }) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(shape.message, opts);
    this.name = 'TRPCProcedureError';
    this.shape = shape;
  }
}

type TRPCErrorWithProcedureShape = TRPCError & {
  [procedureErrorShapeSymbol]?: TRPCErrorShape;
};

/**
 * @deprecated prefer TRPCDeclaredError for fully typesafe error handling
 */
export function setProcedureErrorShape(
  error: TRPCError,
  shape: TRPCErrorShape,
): void {
  (error as TRPCErrorWithProcedureShape)[procedureErrorShapeSymbol] = shape;
}

/**
 * @deprecated prefer TRPCDeclaredError for fully typesafe error handling
 */
export function getProcedureErrorShape(
  error: TRPCError,
): TRPCErrorShape | undefined {
  return (error as TRPCErrorWithProcedureShape)[procedureErrorShapeSymbol];
}
