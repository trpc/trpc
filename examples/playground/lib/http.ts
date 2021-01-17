import { assertNotBrowser } from './assertNotBrowser';

assertNotBrowser();
export class HTTPError extends Error {
  public readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
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
