/* eslint-disable @typescript-eslint/no-explicit-any */
import { ProcedureType } from './router';

export class InputValidationError<TError extends Error> extends Error {
  public readonly originalError: TError;

  constructor(originalError: TError) {
    super(originalError.message);
    this.originalError = originalError;

    Object.setPrototypeOf(this, InputValidationError.prototype);
  }
}

export class RouteNotFoundError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, RouteNotFoundError.prototype);
  }
}
export class NoInputExpectedError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, NoInputExpectedError.prototype);
  }
}

export class HTTPError extends Error {
  public readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, HTTPError.prototype);
  }
}

export class TRPCResponseError extends HTTPError {
  public readonly statusCode: number;
  public readonly path: string;
  public readonly originalError: unknown;
  public readonly procedureType: ProcedureType | 'unknown';
  constructor({
    statusCode,
    message,
    path,
    originalError,
    procedureType,
  }: {
    statusCode: number;
    message: string;
    path: string;
    originalError: unknown;
    procedureType: ProcedureType | 'unknown';
  }) {
    super(statusCode, message);
    this.statusCode = statusCode;
    this.path = path;
    this.originalError = originalError;
    this.procedureType = procedureType;

    Object.setPrototypeOf(this, TRPCResponseError.prototype);
  }
}
/* istanbul ignore next */
export const httpError = {
  forbidden: (message?: string) => new HTTPError(403, message ?? 'Forbidden'),
  unauthorized: (message?: string) =>
    new HTTPError(401, message ?? 'Unauthorized'),
  badRequest: (message?: string) =>
    new HTTPError(400, message ?? 'Bad Request'),
  notFound: (message?: string) => new HTTPError(404, message ?? 'Not found'),
};
export type HTTPSuccessResponseEnvelope<TOutput> = {
  ok: true;
  statusCode: number;
  data: TOutput;
};

export type HTTPErrorResponseEnvelope = {
  ok: false;
  statusCode: number;
  error: {
    message: string;
    stack?: string | undefined;
  };
};

export type HTTPResponseEnvelope<TOutput> =
  | HTTPSuccessResponseEnvelope<TOutput>
  | HTTPErrorResponseEnvelope;

export function getMessageFromUnkown(err: unknown): string {
  if (typeof err === 'string') {
    return err;
  }
  if (typeof (err as any)?.message === 'string') {
    return (err as any).message;
  }
  return `${err}`;
}
export function getErrorFromUnknown(
  err: unknown,
  path: string,
  procedureType: ProcedureType | 'unknown',
): TRPCResponseError {
  if (err instanceof InputValidationError) {
    return new TRPCResponseError({
      statusCode: 400,
      message: err.message,
      originalError: err.originalError,
      path,
      procedureType,
    });
  }
  if (err instanceof RouteNotFoundError) {
    return new TRPCResponseError({
      statusCode: 404,
      message: err.message,
      originalError: err,
      path,
      procedureType,
    });
  }
  if (!(err instanceof Error)) {
    return new TRPCResponseError({
      statusCode: 500,
      message: getMessageFromUnkown(err),
      originalError: err,
      path,
      procedureType,
    });
  }

  const _err = err as typeof err & {
    statusCode?: unknown;
  };
  const statusCode: number =
    typeof _err.statusCode === 'number' ? _err.statusCode : 500;
  const message: string =
    typeof err.message === 'string' ? err.message : 'Internal Server Error';

  return new TRPCResponseError({
    statusCode,
    message,
    originalError: err,
    path,
    procedureType,
  });
}

export function getErrorResponseEnvelope(err: TRPCResponseError) {
  const json: HTTPErrorResponseEnvelope = {
    ok: false,
    statusCode: err.statusCode,
    error: {
      message: err.message,
    },
  };
  if (process.env.NODE_ENV !== 'production' && typeof err.stack === 'string') {
    json.error.stack = err.stack;
  }

  return json;
}
