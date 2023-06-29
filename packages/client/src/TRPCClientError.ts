import {
  AnyProcedure,
  AnyRouter,
  DefaultErrorShape,
  inferRouterError,
  Maybe,
} from '@trpc/server';
import { TRPCErrorResponse, TRPCErrorShape } from '@trpc/server/rpc';

type ErrorInferrable = AnyProcedure | AnyRouter | TRPCErrorShape<number>;

type inferErrorShape<TInferrable extends ErrorInferrable> =
  TInferrable extends AnyRouter
    ? inferRouterError<TInferrable>
    : TInferrable extends AnyProcedure
    ? TInferrable['_def']['_config']['$types']['errorShape']
    : TInferrable;

export interface TRPCClientErrorBase<TShape extends DefaultErrorShape> {
  readonly message: string;
  readonly shape: Maybe<TShape>;
  readonly data: Maybe<TShape['data']>;
}
export type TRPCClientErrorLike<TRouterOrProcedure extends ErrorInferrable> =
  TRPCClientErrorBase<inferErrorShape<TRouterOrProcedure>>;

export class TRPCClientError<TRouterOrProcedure extends ErrorInferrable>
  extends Error
  implements TRPCClientErrorBase<inferErrorShape<TRouterOrProcedure>>
{
  public readonly cause;
  public readonly shape: Maybe<inferErrorShape<TRouterOrProcedure>>;
  public readonly data: Maybe<inferErrorShape<TRouterOrProcedure>['data']>;
  public readonly meta;

  constructor(
    message: string,
    opts?: {
      result?: Maybe<inferErrorShape<TRouterOrProcedure>>;
      cause?: Error;
      meta?: Record<string, unknown>;
    },
  ) {
    const cause = opts?.cause;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.meta = opts?.meta;

    this.cause = cause;
    this.shape = opts?.result?.error;
    this.data = opts?.result?.error.data;
    this.name = 'TRPCClientError';

    Object.setPrototypeOf(this, TRPCClientError.prototype);
  }

  public static from<TRouterOrProcedure extends ErrorInferrable>(
    cause: Error | TRPCErrorResponse<any>,
    opts: { meta?: Record<string, unknown> } = {},
  ): TRPCClientError<TRouterOrProcedure> {
    if (!(cause instanceof Error)) {
      return new TRPCClientError<TRouterOrProcedure>(
        cause.error.message ?? '',
        {
          ...opts,
          cause: undefined,
          result: cause as any,
        },
      );
    }
    if (cause.name === 'TRPCClientError') {
      return cause as TRPCClientError<any>;
    }

    return new TRPCClientError<TRouterOrProcedure>(cause.message, {
      ...opts,
      cause,
      result: null,
    });
  }
}
