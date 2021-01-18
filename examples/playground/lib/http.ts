import { assertNotBrowser } from './assertNotBrowser';

assertNotBrowser();
export class HTTPError extends Error {
  public readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, HTTPError.prototype);
  }
}

export const httpError = {
  forbidden: (message?: string) => new HTTPError(403, message ?? 'Forbidden'),
  unauthorized: (message?: string) =>
    new HTTPError(401, message ?? 'Unauthorized'),
  badRequest: (message?: string) =>
    new HTTPError(400, message ?? 'Bad Request'),
  notFound: (message?: string) => new HTTPError(404, message ?? 'Not found'),
};
export type HTTPSuccessResponseEnvelope<TData> = {
  ok: true;
  statusCode: number;
  data: TData;
};

export type HTTPErrorResponseEnvelope = {
  ok: false;
  statusCode: number;
  error: {
    message: string;
    stack?: string | undefined;
  };
};

export type HTTPResponseEnvelope<TData> =
  | HTTPSuccessResponseEnvelope<TData>
  | HTTPErrorResponseEnvelope;

export function getErrorResponseEnvelope(err?: Partial<HTTPError>) {
  const statusCode: number =
    typeof err?.statusCode === 'number' ? err.statusCode : 500;
  const message: string =
    typeof err?.message === 'string' ? err.message : 'Internal Server Error';

  const stack: string | undefined =
    process.env.NODE_ENV !== 'production' && typeof err?.stack === 'string'
      ? err.stack
      : undefined;

  const json: HTTPErrorResponseEnvelope = {
    ok: false,
    statusCode,
    error: {
      message,
      stack,
    },
  };

  return json;
}
