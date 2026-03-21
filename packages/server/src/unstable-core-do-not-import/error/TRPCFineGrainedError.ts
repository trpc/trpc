import type { TRPC_ERROR_CODE_KEY } from '../rpc/codes';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc/codes';
import type { TRPCErrorShape } from '../rpc/envelopes';
import { TRPCError } from './TRPCError';

export const trpcFineGrainedErrorSymbol = Symbol('trpc.fineGrainedError');

export type InferTRPCFineGrainedErrorShape<TClass> = TClass extends {
  readonly __trpcFineGrainedErrorShape: infer TShape extends TRPCErrorShape;
}
  ? TShape
  : never;

export type AnyTRPCFineGrainedErrorClass = {
  new (
    ...args: any[]
  ): TRPCError & { readonly [trpcFineGrainedErrorSymbol]: true };
  readonly __trpcFineGrainedErrorShape: TRPCErrorShape;
};

type FineGrainedErrorShape<
  TCode extends TRPC_ERROR_CODE_KEY,
  TData extends object,
> = {
  code: (typeof TRPC_ERROR_CODES_BY_KEY)[TCode];
  message: TCode;
  data: TData;
};

interface TRPCFineGrainedErrorInstance<
  TData extends object = object,
  TMessage extends string = string,
> extends TRPCError {
  readonly [trpcFineGrainedErrorSymbol]: true;
  message: TMessage;
  toShape(): {
    code: TRPCErrorShape<TData>['code'];
    message: TMessage;
    data: TData;
  };
}

export function isTRPCFineGrainedError(
  error: TRPCError,
): error is TRPCError & TRPCFineGrainedErrorInstance {
  return trpcFineGrainedErrorSymbol in error;
}

type BasicErrorKeys = {
  code: TRPC_ERROR_CODE_KEY;
};

type OptionalKeys<T extends object> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

type ConstructorExtraParams<
  TExtraParams extends Record<string, unknown>,
  TDefaults extends object,
  TConstants extends object,
> = Partial<Pick<TExtraParams, Extract<keyof TExtraParams, keyof TDefaults>>> &
  Required<
    Pick<
      TExtraParams,
      Exclude<
        Exclude<
          Exclude<keyof TExtraParams, OptionalKeys<TExtraParams>>,
          keyof TDefaults
        >,
        keyof TConstants
      >
    >
  > &
  Partial<
    Pick<
      TExtraParams,
      Exclude<Exclude<OptionalKeys<TExtraParams>, keyof TDefaults>, keyof TConstants>
    >
  >;

type ConstructorInput<
  TExtraParams extends Record<string, unknown>,
  TDefaults extends object,
  TConstants extends object,
> = ConstructorExtraParams<TExtraParams, TDefaults, TConstants>;

type DefaultsInput<TExtraParams extends Record<string, unknown>> =
  Partial<TExtraParams>;

type TRPCFineGrainedErrorClass<
  TCode extends TRPC_ERROR_CODE_KEY,
  TExtraParams extends Record<string, unknown>,
  TDefaults extends object,
  TConstants extends object,
> = ({} extends ConstructorExtraParams<TExtraParams, TDefaults, TConstants>
  ? {
      new (
        input?: ConstructorInput<TExtraParams, TDefaults, TConstants>,
      ): TRPCError &
        TRPCFineGrainedErrorInstance<TExtraParams, TCode> &
        Omit<TExtraParams, 'message'>;
    }
  : {
      new (
        input: ConstructorInput<TExtraParams, TDefaults, TConstants>,
      ): TRPCError &
        TRPCFineGrainedErrorInstance<TExtraParams, TCode> &
        Omit<TExtraParams, 'message'>;
    }) & {
  readonly __trpcFineGrainedErrorShape: FineGrainedErrorShape<
    TCode,
    TExtraParams
  >;
};

type TRPCFineGrainedErrorBuilder<
  TCode extends TRPC_ERROR_CODE_KEY,
  TExtraParams extends Record<string, unknown>,
> = {
  data<const TNewExtraParams extends Record<string, unknown>>(): TRPCFineGrainedErrorBuilder<
    TCode,
    TNewExtraParams
  >;
  create(): TRPCFineGrainedErrorClass<TCode, TExtraParams, {}, {}>;
  create<
    const TDefaults extends Partial<TExtraParams> = {},
    const TConstants extends Partial<TExtraParams> = {},
  >(opts: {
    defaults?: DefaultsInput<TExtraParams> & TDefaults;
    constants?: DefaultsInput<TExtraParams> & TConstants;
  }): TRPCFineGrainedErrorClass<TCode, TExtraParams, TDefaults, TConstants>;
};

/**
 * Creates a typed error class for per-procedure error definitions.
 *
 * - `code` is mandatory in the first call
 * - error `message` is always the code literal
 * - `data<...>()` declares extra per-instance data fields
 * - `create({ defaults, constants })` materializes the error class
 *
 * ```ts
 * const MyError = createTRPCFineGrainedError('NOT_FOUND')
 *   .data<{
 *     resourceType: 'user';
 *   }>()
 *   .create({
 *     constants: {
 *       resourceType: 'user',
 *     },
 *   });
 *
 * throw new MyError()
 * // error.resourceType === 'user'
 * ```
 */
export function createTRPCFineGrainedError<
  const TCode extends TRPC_ERROR_CODE_KEY,
>(code: TCode): TRPCFineGrainedErrorBuilder<TCode, {}>;

export function createTRPCFineGrainedError(code: TRPC_ERROR_CODE_KEY): any {
  return createTRPCFineGrainedErrorBuilder({ code });
}

function createTRPCFineGrainedErrorBuilder(
  opts: BasicErrorKeys & Record<string, unknown>,
) {
  return {
    data: () => createTRPCFineGrainedErrorBuilder(opts),
    create: (createOpts?: {
      defaults?: Record<string, unknown>;
      constants?: Record<string, unknown>;
    }) =>
      createTRPCFineGrainedErrorClass({
        ...opts,
        ...(createOpts?.defaults ?? {}),
        ...(createOpts?.constants ?? {}),
      }),
  };
}

function createTRPCFineGrainedErrorClass(
  opts: BasicErrorKeys & Record<string, unknown>,
) {
  const { code, ...consts } = opts;
  const numericCode = TRPC_ERROR_CODES_BY_KEY[code];

  const TRPCFineGrainedError = class TRPCFineGrainedError extends TRPCError {
    static readonly __trpcFineGrainedErrorShape = null as any;
    readonly [trpcFineGrainedErrorSymbol] = true as const;
    #rest: Record<string, unknown>;

    constructor(input?: Record<string, unknown>) {
      const rest = input ?? {};
      super({ code, message: code });

      this.#rest = rest;
      const { message: _message, ...instanceFields } = { ...consts, ...rest };
      Object.assign(this, instanceFields);
    }

    toShape(): FineGrainedErrorShape<typeof code, Record<string, unknown>> {
      return {
        code: numericCode,
        message: code,
        data: { ...consts, ...this.#rest },
      };
    }
  };

  return TRPCFineGrainedError;
}
