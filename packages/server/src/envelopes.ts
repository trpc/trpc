import { AnyRouter } from './router';

export interface TRPCProcedureSuccessEnvelope<TOutput> {
  ok: true;
  data: TOutput;
  /**
   * Only available on HTTP requests
   */
  statusCode?: number;
}

export interface TRPCProcedureErrorEnvelope<TRouter extends AnyRouter> {
  ok: false;
  error: ReturnType<TRouter['_def']['errorFormatter']>;
  /**
   * Only available on HTTP requests
   */
  statusCode?: number;
}

export type TRPCProcedureEnvelope<TRouter extends AnyRouter, TOutput> =
  | TRPCProcedureSuccessEnvelope<TOutput>
  | TRPCProcedureErrorEnvelope<TRouter>;
