import type { TRPC_ERROR_CODE_KEY } from '../rpc/codes';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc/codes';
import type { TRPCErrorShape } from '../rpc/envelopes';
import { TRPCError } from './TRPCError';

export const trpcDeclaredErrorSymbol = Symbol('trpc.declaredError');

export type InferTRPCDeclaredErrorShape<TClass> = TClass extends {
  readonly __trpcDeclaredErrorShape: infer TShape extends TRPCErrorShape;
}
  ? TShape
  : never;

export type AnyTRPCDeclaredErrorClass = {
  new (
    ...args: any[]
  ): TRPCError & { readonly [trpcDeclaredErrorSymbol]: true };
  readonly __trpcDeclaredErrorShape: TRPCErrorShape;
};

type DeclaredErrorShape<
  TCode extends TRPC_ERROR_CODE_KEY,
  TData extends object,
> = {
  code: (typeof TRPC_ERROR_CODES_BY_KEY)[TCode];
  message: TCode;
  data: TData;
};

interface TRPCDeclaredErrorInstance<
  TData extends object = object,
  TMessage extends string = string,
> extends TRPCError {
  readonly [trpcDeclaredErrorSymbol]: true;
  message: TMessage;
  toShape(): {
    code: TRPCErrorShape<TData>['code'];
    message: TMessage;
    data: TData;
  };
}

export function isTRPCDeclaredError(
  error: TRPCError,
): error is TRPCError & TRPCDeclaredErrorInstance {
  return trpcDeclaredErrorSymbol in error;
}

export function isRegisteredTRPCDeclaredError(
  error: TRPCError & TRPCDeclaredErrorInstance,
  declaredErrors: readonly AnyTRPCDeclaredErrorClass[] | undefined,
) {
  if (!declaredErrors?.length) {
    return false;
  }

  return declaredErrors.some(
    (RegisteredDeclaredError) => error instanceof RegisteredDeclaredError,
  );
}

/**
 * Creates a typed error class for per-procedure error definitions.
 *
 * - `code` is mandatory in the first call
 * - error `message` is always the code literal
 * - `data<...>()` declares extra per-instance data fields
 * - `create({ defaults, constants })` materializes the error class
 *
 * ```ts
 * const MyError = createTRPCDeclaredError('NOT_FOUND')
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
export function createTRPCDeclaredError<
  const TCode extends TRPC_ERROR_CODE_KEY,
>(code: TCode): TRPCDeclaredErrorBuilder<TCode, {}>;

export function createTRPCDeclaredError(code: TRPC_ERROR_CODE_KEY): any {
  return createTRPCDeclaredErrorBuilder({ code });
}

function createTRPCDeclaredErrorBuilder(
  opts: BasicErrorKeys & Record<string, unknown>,
) {
  return {
    data: () => createTRPCDeclaredErrorBuilder(opts),
    create: (createOpts?: {
      defaults?: Record<string, unknown>;
      constants?: Record<string, unknown>;
    }) =>
      createTRPCDeclaredErrorClass({
        ...opts,
        ...(createOpts?.defaults ?? {}),
        ...(createOpts?.constants ?? {}),
      }),
  };
}

function createTRPCDeclaredErrorClass(
  opts: BasicErrorKeys & Record<string, unknown>,
) {
  const { code, ...consts } = opts;
  const numericCode = TRPC_ERROR_CODES_BY_KEY[code];

  const TRPCDeclaredError = class TRPCDeclaredError extends TRPCError {
    static readonly __trpcDeclaredErrorShape = null as any;
    readonly [trpcDeclaredErrorSymbol] = true as const;
    #rest: Record<string, unknown>;

    constructor(input?: Record<string, unknown>) {
      const rest = input ?? {};
      super({ code, message: code });

      this.#rest = rest;
      const { message: _message, ...instanceFields } = { ...consts, ...rest };
      Object.assign(this, instanceFields);
    }

    toShape(): DeclaredErrorShape<typeof code, Record<string, unknown>> {
      return {
        code: numericCode,
        message: code,
        data: { ...consts, ...this.#rest },
      };
    }
  };

  return TRPCDeclaredError;
}

//
// Type definitions
//

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
      Exclude<
        Exclude<OptionalKeys<TExtraParams>, keyof TDefaults>,
        keyof TConstants
      >
    >
  >;

type ConstructorInput<
  TExtraParams extends Record<string, unknown>,
  TDefaults extends object,
  TConstants extends object,
> = ConstructorExtraParams<TExtraParams, TDefaults, TConstants>;

type DefaultsInput<TExtraParams extends Record<string, unknown>> =
  Partial<TExtraParams>;

type TRPCDeclaredErrorClass<
  TCode extends TRPC_ERROR_CODE_KEY,
  TExtraParams extends Record<string, unknown>,
  TDefaults extends object,
  TConstants extends object,
> = ({} extends ConstructorExtraParams<TExtraParams, TDefaults, TConstants>
  ? {
      new (
        input?: ConstructorInput<TExtraParams, TDefaults, TConstants>,
      ): TRPCError &
        TRPCDeclaredErrorInstance<TExtraParams, TCode> &
        Omit<TExtraParams, 'message'>;
    }
  : {
      new (
        input: ConstructorInput<TExtraParams, TDefaults, TConstants>,
      ): TRPCError &
        TRPCDeclaredErrorInstance<TExtraParams, TCode> &
        Omit<TExtraParams, 'message'>;
    }) & {
  readonly __trpcDeclaredErrorShape: DeclaredErrorShape<TCode, TExtraParams>;
};

type TRPCDeclaredErrorBuilder<
  TCode extends TRPC_ERROR_CODE_KEY,
  TExtraParams extends Record<string, unknown>,
> = {
  data<
    const TNewExtraParams extends Record<string, unknown>,
  >(): TRPCDeclaredErrorBuilder<TCode, TNewExtraParams>;
  create(): TRPCDeclaredErrorClass<TCode, TExtraParams, {}, {}>;
  create<
    const TDefaults extends Partial<TExtraParams> = {},
    const TConstants extends Partial<TExtraParams> = {},
  >(opts: {
    defaults?: DefaultsInput<TExtraParams> & TDefaults;
    constants?: DefaultsInput<TExtraParams> & TConstants;
  }): TRPCDeclaredErrorClass<TCode, TExtraParams, TDefaults, TConstants>;
};
