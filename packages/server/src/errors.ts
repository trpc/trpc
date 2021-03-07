export class TRPCError<TCode extends string = string> extends Error {
  public readonly originalError?: unknown;
  public readonly code;

  constructor({
    message,
    code,
    originalError,
  }: {
    message: string;
    code: TCode;
    originalError?: unknown;
  }) {
    super(message);
    this.code = code;
    this.originalError = originalError;

    Object.setPrototypeOf(this, TRPCError.prototype);
  }
}
export interface TRPCErrorOptions {
  originalError?: unknown;
}

export const inputValidationError = (
  message: string,
  opts: TRPCErrorOptions = {},
) => new TRPCError({ message, code: 'BAD_USER_INPUT', ...opts });

export const notFoundError = (message: string, opts: TRPCErrorOptions = {}) =>
  new TRPCError({ message, code: 'NOT_FOUND', ...opts });

export const internalServerError = (originalError: unknown) => {
  const message = getMessageFromUnkownError(
    originalError,
    'Internal Server Error',
  );
  return new TRPCError({
    message,
    code: 'INTERNAL_SERVER_ERROR',
    originalError,
  });
};

export function getMessageFromUnkownError(
  err: unknown,
  fallback: string,
): string {
  if (typeof err === 'string') {
    return err;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = (err as any)?.message;
  if (typeof message === 'string') {
    return message;
  }
  return fallback;
}

export function getErrorFromUnknown(err: unknown): TRPCError {
  if (err instanceof TRPCError) {
    return err;
  }
  return internalServerError(err);
}
