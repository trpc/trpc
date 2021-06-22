import { TRPC_ERROR_CODE_KEY } from './rpc/codes';

export class TRPCError extends Error {
  public readonly originalError?: unknown;
  public readonly code;

  constructor({
    message,
    code,
    originalError,
  }: {
    message?: string;
    code: TRPC_ERROR_CODE_KEY;
    originalError?: unknown;
  }) {
    super(message ?? getMessageFromUnkownError(originalError, code));
    this.code = code;
    this.originalError = originalError;
    this.name = 'TRPCError';

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
export interface TRPCErrorOptions {
  originalError?: unknown;
}

export function getMessageFromUnkownError(
  err: unknown,
  fallback: string,
): string {
  if (typeof err === 'string') {
    return err;
  }

  if (err instanceof Error && typeof err.message === 'string') {
    return err.message;
  }
  return fallback;
}

export function getErrorFromUnknown(originalError: unknown): TRPCError {
  // this should ideally be an `instanceof TRPCError` but for some reason that isn't working
  // ref https://github.com/trpc/trpc/issues/331
  if (originalError instanceof Error && originalError.name === 'TRPCError') {
    return originalError as TRPCError;
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', originalError });
}
