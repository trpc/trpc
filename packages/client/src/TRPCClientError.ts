import { AnyRouter, inferRouterError, Maybe } from '@trpc/server';
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
  public readonly meta;

  constructor(
    message: string,
    opts?: {
      result: Maybe<TRPCErrorResponse<inferRouterError<TRouter>>>;
      /**
       * @deprecated use `cause`
       **/
      originalError?: Maybe<Error>;
      cause?: Maybe<Error>;
      meta?: Record<string, unknown>;
    },
  ) {
    const cause = opts?.cause ?? opts?.originalError;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.meta = opts?.meta;

    this.cause = this.originalError = cause;
    this.shape = opts?.result?.error;
    this.data = opts?.result?.error.data;
    this.name = 'TRPCClientError';

    Object.setPrototypeOf(this, TRPCClientError.prototype);
  }

  public static from<TRouter extends AnyRouter>(
    result: Error | TRPCErrorResponse<any>,
    opts: { meta?: Record<string, unknown> } = {},
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
