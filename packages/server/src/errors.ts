/* eslint-disable @typescript-eslint/no-explicit-any */

export abstract class TRPCError<TCode extends string = string> extends Error {
  public readonly code;
  // public readonly statusCode?: number;
  constructor(message: string, code: TCode) {
    super(message);
    this.code = code;
    Object.setPrototypeOf(this, TRPCError.prototype);
  }
}

export class InputValidationError extends TRPCError<'BAD_USER_INPUT'> {
  public readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message, 'BAD_USER_INPUT');
    this.originalError = originalError;

    Object.setPrototypeOf(this, InputValidationError.prototype);
  }
}

export class NotFoundError extends TRPCError<'NOT_FOUND'> {
  constructor(message: string) {
    super(message, 'NOT_FOUND');

    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class InternalServerError extends TRPCError<'INTERNAL_SERVER_ERROR'> {
  public readonly originalError: unknown;

  constructor(originalError: unknown) {
    const message = getMessageFromUnkownError(
      originalError,
      'INTERNAL_SERVER_ERROR',
    );
    super(message, 'INTERNAL_SERVER_ERROR');
    this.originalError = originalError;

    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}

export class ForbiddenError extends TRPCError<'FORBIDDEN'> {
  constructor(message: string) {
    super(message, 'FORBIDDEN');

    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}
export class UnauthenticatedError extends TRPCError<'UNAUTHENTICATED'> {
  constructor(message: string) {
    super(message, 'UNAUTHENTICATED');

    Object.setPrototypeOf(this, UnauthenticatedError.prototype);
  }
}

export class PayloadTooLargeError extends TRPCError<'PAYLOAD_TOO_LARGE'> {
  constructor(message: string) {
    super(message, 'PAYLOAD_TOO_LARGE');

    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}

export function getMessageFromUnkownError(
  err: unknown,
  fallback: string,
): string {
  if (typeof err === 'string') {
    return err;
  }
  const message = (err as any)?.message;
  if (message === 'string') {
    return message;
  }
  return fallback;
}
export function getErrorFromUnknown(err: unknown): TRPCError {
  if (err instanceof TRPCError) {
    return err;
  }
  return new InternalServerError(err);
}
