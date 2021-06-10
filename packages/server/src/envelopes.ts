import { AnyRouter } from './router';

export interface TRPCProcedureSuccessEnvelope<TOutput> {
  ok: true;
  data: TOutput;
}

export interface TRPCProcedureErrorEnvelope<TRouter extends AnyRouter> {
  ok: false;
  error: ReturnType<TRouter['_def']['errorFormatter']>;
}
