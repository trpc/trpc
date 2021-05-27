import { TRPCError, TRPCErrorOptions } from '../errors';
import { Dict } from '../types';

const STATUS_CODE_MAP: Dict<number> = {
  BAD_USER_INPUT: 400,
  INTERAL_SERVER_ERROR: 500,
  NOT_FOUND: 404,
};
export interface HttpErrorOptions<TCode extends string>
  extends TRPCErrorOptions {
  code: TCode;
  statusCode: number;
}
export class HTTPError<TCode extends string> extends TRPCError<TCode> {
  public readonly statusCode: number;

  constructor(message: string, opts: HttpErrorOptions<TCode>) {
    super({ message, ...opts });
    this.statusCode = opts.statusCode;

    // this is set to TRPCError as `instanceof TRPCError` doesn't seem to work on error sub-classes
    Object.setPrototypeOf(this, HTTPError.prototype);
  }
}
/* istanbul ignore next */
export const httpError = {
  forbidden: (message?: string) =>
    new HTTPError(message ?? 'Forbidden', {
      statusCode: 403,
      code: 'FORBIDDEN',
    }),
  unauthorized: (message?: string) =>
    new HTTPError(message ?? 'Unauthorized', {
      statusCode: 401,
      code: 'UNAUTHENTICATED',
    }),
  badRequest: (message?: string) =>
    new HTTPError(message ?? 'Bad Request', {
      statusCode: 400,
      code: 'BAD_USER_INPUT',
    }),
  notFound: (message?: string) =>
    new HTTPError(message ?? 'Not found', {
      statusCode: 404,
      code: 'NOT_FOUND',
    }),
};

export function getStatusCodeFromError(err: TRPCError): number {
  const statusCodeFromError = (err as any)?.statusCode;
  if (typeof statusCodeFromError === 'number') {
    return statusCodeFromError;
  }
  return STATUS_CODE_MAP[err.code] ?? 500;
}
