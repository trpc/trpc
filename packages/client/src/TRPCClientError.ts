import type {
  inferClientTypes,
  InferrableClientTypes,
  Maybe,
  TRPCErrorResponse,
  TRPCErrorShape,
} from '@trpc/server/unstable-core-do-not-import';
import { isObject } from '@trpc/server/unstable-core-do-not-import';

type ErrorShape<TInferrable extends InferrableClientTypes> =
  inferClientTypes<TInferrable>['errorShape'];

type ClientErrorShape<TInferrable extends InferrableClientTypes> =
  | ErrorShape<TInferrable>
  | undefined;

type ErrorData<TShape> = TShape extends TRPCErrorShape
  ? TShape['data']
  : undefined;

type DeclaredErrorKeyFromShape<TShape> =
  Extract<
    TShape,
    {
      '~': {
        kind: 'declared';
        declaredErrorKey: string;
      };
    }
  > extends {
    '~': { declaredErrorKey: infer TDeclaredErrorKey extends string };
  }
    ? TDeclaredErrorKey
    : never;

type ErrorDiscriminator<TShape> = TShape extends {
  '~': {
    kind: 'declared';
    declaredErrorKey: infer TDeclaredErrorKey extends string;
  };
}
  ? {
      readonly kind: 'declared';
      readonly key: TDeclaredErrorKey;
      readonly shape: TShape;
      readonly cause: Error | undefined;
    }
  : TShape extends {
        '~': { kind: 'formatted' };
      }
    ? {
        readonly kind: 'formatted';
        readonly shape: TShape;
        readonly cause: Error | undefined;
      }
    : {
        readonly kind: 'unknown';
        readonly shape: undefined;
        readonly cause: Error | undefined;
      };

export interface TRPCClientErrorBase<TShape extends TRPCErrorShape> {
  readonly message: string;
  readonly shape: Maybe<TShape>;
  readonly data: Maybe<TShape['data']>;
}

export type TRPCClientErrorLike<TInferrable extends InferrableClientTypes> =
  TRPCClientErrorBase<ErrorShape<TInferrable>>;

function isTRPCErrorResponse(obj: unknown): obj is TRPCErrorResponse<any> {
  return (
    isObject(obj) &&
    isObject(obj['error']) &&
    typeof obj['error']['code'] === 'number' &&
    typeof obj['error']['message'] === 'string'
  );
}

function getMessageFromUnknownError(err: unknown, fallback: string): string {
  if (typeof err === 'string') {
    return err;
  }
  if (isObject(err) && typeof err['message'] === 'string') {
    return err['message'];
  }
  return fallback;
}

class TRPCClientErrorImpl<
    TInferrable extends InferrableClientTypes,
    TShape extends
      ClientErrorShape<TInferrable> = ClientErrorShape<TInferrable>,
  >
  extends Error
  implements TRPCClientErrorBase<ErrorShape<TInferrable>>
{
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore override doesn't work in all environments due to "This member cannot have an 'override' modifier because it is not declared in the base class 'Error'"
  public override readonly cause;
  public readonly shape: TShape;

  /**
   * Additional meta data about the error.
   * For HTTP errors this may include `response` and `responseJSON`.
   */
  public meta?: Record<string, unknown>;

  constructor(
    message: string,
    opts?: {
      result?: Maybe<TRPCErrorResponse<ErrorShape<TInferrable>>>;
      cause?: unknown;
      meta?: Record<string, unknown>;
    },
  ) {
    const cause = opts?.cause;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(message, { cause });

    this.meta = opts?.meta;
    this.cause = cause;
    this.shape = (opts?.result?.error ?? undefined) as TShape;
    this.name = 'TRPCClientError';

    Object.setPrototypeOf(this, TRPCClientErrorImpl.prototype);
  }

  public get data(): ErrorData<TShape> {
    return this.shape?.data;
  }

  public get discriminator(): ErrorDiscriminator<TShape> {
    if (this.shape?.['~']?.kind === 'formatted') {
      return {
        kind: 'formatted',
        shape: this.shape,
        cause: this.cause,
      } as ErrorDiscriminator<TShape>;
    }

    if (this.shape?.['~']?.kind === 'declared') {
      return {
        kind: 'declared',
        key: this.shape['~'].declaredErrorKey,
        shape: this.shape,
        cause: this.cause,
      } as ErrorDiscriminator<TShape>;
    }

    return {
      kind: 'unknown',
      shape: undefined,
      cause: this.cause,
    } as ErrorDiscriminator<TShape>;
  }

  public isFormattedError(): this is TRPCClientErrorImpl<
    TInferrable,
    Extract<TShape, { '~': { kind: 'formatted' } }>
  > {
    return this.shape?.['~']?.kind === 'formatted';
  }

  public isDeclaredError(): this is TRPCClientErrorImpl<
    TInferrable,
    Extract<
      TShape,
      {
        '~': {
          kind: 'declared';
          declaredErrorKey: string;
        };
      }
    >
  >;
  public isDeclaredError<
    const TDeclaredErrorKey extends DeclaredErrorKeyFromShape<TShape>,
  >(
    declaredErrorKey: TDeclaredErrorKey,
  ): this is TRPCClientErrorImpl<
    TInferrable,
    Extract<
      TShape,
      {
        '~': {
          kind: 'declared';
          declaredErrorKey: TDeclaredErrorKey;
        };
      }
    >
  >;
  public isDeclaredError(declaredErrorKey?: string) {
    return (
      this.shape?.['~']?.kind === 'declared' &&
      (declaredErrorKey === undefined ||
        this.shape['~'].declaredErrorKey === declaredErrorKey)
    );
  }

  public static from<TInferrable extends InferrableClientTypes>(
    _cause: Error | TRPCErrorResponse<any> | object,
    opts: { meta?: Record<string, unknown>; cause?: Error } = {},
  ): TRPCClientError<TInferrable> {
    const cause = _cause as unknown;

    if (isTRPCClientError(cause)) {
      if (!opts.meta) {
        return cause;
      }

      return new TRPCClientErrorImpl<TInferrable>(cause.message, {
        result: cause.shape ? { error: cause.shape } : undefined,
        cause: cause.cause instanceof Error ? cause.cause : undefined,
        meta: {
          ...cause.meta,
          ...opts.meta,
        },
      });
    }

    if (isTRPCErrorResponse(cause)) {
      return new TRPCClientErrorImpl<TInferrable>(cause.error.message, {
        ...opts,
        result: cause,
        cause: opts.cause,
      });
    }

    return new TRPCClientErrorImpl<TInferrable>(
      getMessageFromUnknownError(cause, 'Unknown error'),
      {
        ...opts,
        cause: cause,
      },
    );
  }
}

export type TRPCClientError<TInferrable extends InferrableClientTypes> =
  TRPCClientErrorImpl<TInferrable, ClientErrorShape<TInferrable>>;

export const TRPCClientError = TRPCClientErrorImpl;

export function isTRPCClientError<TInferrable extends InferrableClientTypes>(
  cause: unknown,
): cause is TRPCClientError<TInferrable> & TRPCClientErrorLike<TInferrable> {
  return cause instanceof TRPCClientErrorImpl;
}
