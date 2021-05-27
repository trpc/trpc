import { AnyRouter } from '../router';

export type HTTPSuccessResponseEnvelope<TOutput> = {
  ok: true;
  statusCode: number;
  data: TOutput;
};

export type HTTPErrorResponseEnvelope<TRouter extends AnyRouter> = {
  ok: false;
  statusCode: number;
  error: ReturnType<TRouter['_def']['errorFormatter']>;
};

export type HTTPResponseEnvelope<TOutput, TRouter extends AnyRouter> =
  | HTTPSuccessResponseEnvelope<TOutput>
  | HTTPErrorResponseEnvelope<TRouter>;
