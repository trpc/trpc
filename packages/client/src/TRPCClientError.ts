import { AnyRouter, Maybe } from '@trpc/server';
import { TRPCErrorShape, TRPCErrorResponse } from '@trpc/server/rpc';

export class TRPCClientError<
  TRouter extends AnyRouter,
  TErrorShape extends TRPCErrorShape = ReturnType<TRouter['getErrorShape']>,
> extends Error {
  public readonly originalError;
  public readonly shape: Maybe<TErrorShape>;
  /**
   * Fatal error - expect no more results after this error
   * Used for when WebSockets disconnect prematurely.
   */
  public readonly isDone: boolean;

  constructor(
    message: string,
    {
      originalError,
      isDone = false,
      result,
    }: {
      result: Maybe<TRPCErrorResponse<TErrorShape>>;
      originalError: Maybe<Error>;
      isDone?: boolean;
    },
  ) {
    super(message);
    this.isDone = isDone;
    this.message = message;
    this.originalError = originalError;
    this.shape = result?.error;
    this.name = 'TRPCClientError';

    this.name = 'TRPCClientError';
    Object.setPrototypeOf(this, TRPCClientError.prototype);
  }

  public static from<TRouter extends AnyRouter>(
    result: Error | TRPCErrorResponse<any>,
    opts: { isDone?: boolean } = {},
  ): TRPCClientError<TRouter> {
    if (!(result instanceof Error)) {
      return new TRPCClientError<TRouter>((result.error as any).message ?? '', {
        ...opts,
        originalError: null,
        result: result,
      });
    }
    if (result.name === 'TRPCClientError') {
      return result as TRPCClientError<any>;
    }

    return new TRPCClientError<TRouter>(result.message, {
      ...opts,
      originalError: result,
      result: null,
    });
  }
}
