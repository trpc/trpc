export class HTTPError extends Error {
  public readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const forbiddenError = (message?: string) =>
  new HTTPError(403, message ?? 'Forbidden');
export const unauthorizedError = (message?: string) =>
  new HTTPError(401, message ?? 'Unauthorized');
export const badRequestError = (message?: string) =>
  new HTTPError(400, message ?? 'Bad Request');
export const notFoundError = (message?: string) =>
  new HTTPError(404, message ?? 'Not found');

export type HTTPSuccessResponse<TData> = {
  ok: true;
  statusCode: number;
  data: TData;
};

export type HTTPErrorResponse = {
  ok: false;
  statusCode: number;
  error: {
    message: string;
    stack?: string | undefined;
  };
};

export type HTTPResponse<TData> =
  | HTTPSuccessResponse<TData>
  | HTTPErrorResponse;
