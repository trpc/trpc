import { AnyRouter, Maybe, inferRouterError } from '@trpc/server';
import { TRPCErrorResponse } from '@trpc/server/rpc';

export interface TRPCClientErrorLike<TRouter extends AnyRouter> {
  readonly message: string;
  readonly shape: Maybe<inferRouterError<TRouter>>;
  readonly data: Maybe<inferRouterError<TRouter>['data']>;
}

export class TRPCClientError<TRouter extends AnyRouter>
  extends Error
  implements TRPCClientErrorLike<TRouter>
{
  /**
   * @deprecated use `cause`
   */
  public readonly originalError;
  public readonly cause;
  public readonly shape: Maybe<inferRouterError<TRouter>>;
  public readonly data: Maybe<inferRouterError<TRouter>['data']>;
  /**
   * Fatal error - expect no more results after this error
   * Used for when WebSockets disconnect prematurely.
   */
  public readonly isDone: boolean;

  constructor(
    message: string,
    opts: {
      result: Maybe<TRPCErrorResponse<inferRouterError<TRouter>>>;
      /**
       * @deprecated use cause
       **/
      originalError?: Maybe<Error>;
      cause?: Maybe<Error>;
      isDone?: boolean;
    },
  ) {
    const cause = opts.cause ?? opts.originalError;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.isDone = opts.isDone ?? false;

    this.cause = this.originalError = cause;
    this.shape = opts.result?.error;
    this.data = opts.result?.error.data;
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
        cause: null,
        result: result,
      });
    }
    if (result.name === 'TRPCClientError') {
      return result as TRPCClientError<any>;
    }

    return new TRPCClientError<TRouter>(result.message, {
      ...opts,
      cause: result,
      result: null,
    });
  }
}
