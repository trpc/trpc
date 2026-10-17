/**
 * Type-level prototype of 07's combined model (returned + declared errors,
 * mapping middleware, Effect `E` channel, client narrowing). Everything is
 * `declare`d: the spike only asks whether the types can be inferred, and what
 * they cost. Names follow the proposal text; none of this is decided API.
 */
import type * as Cause from 'effect/Cause';
import type * as Effect from 'effect/Effect';

declare const errorBrand: unique symbol;
/** Isomorphic error. Yieldable, so it is also an `Effect<never, this>`. */
export interface TrpcError<TCode extends string = string, TData = unknown>
  extends Cause.YieldableError {
  readonly [errorBrand]: true;
  readonly code: TCode;
  readonly data: TData;
  readonly status: number;
}
export type AnyTrpcError = TrpcError<string, any>;
export declare function error<
  const TCode extends string,
  TData = undefined,
>(opts: {
  code: TCode;
  data?: TData;
  message?: string;
  status?: number;
}): TrpcError<TCode, TData>;
export declare function isTrpcError<T>(
  value: T,
): value is Extract<T, AnyTrpcError>;
export type BuiltinCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_SERVER_ERROR';
export interface Issue {
  readonly message: string;
  readonly path?: readonly PropertyKey[];
}
export type InputValidationError = TrpcError<
  'BAD_REQUEST',
  {
    issues: readonly Issue[];
  }
>;
type IsAny<T> = 0 extends 1 & T ? true : false;
/** Success part of a resolver's (awaited) return type. */
type OutputOf<R> = R extends AnyTrpcError
  ? never
  : R extends Effect.Effect<infer A, any, any>
    ? A
    : R;
/** Error part. A returned `TrpcError` and an Effect failure are the same case. */
type ErrorsOf<R> = R extends AnyTrpcError
  ? R
  : R extends Effect.Effect<any, infer E, any>
    ? E
    : never;
export type SplitReturn<R> = SplitAwaited<Awaited<R>>;
type SplitAwaited<R> =
  IsAny<R> extends true
    ? {
        output: any;
        errors: never;
      }
    : {
        output: OutputOf<R>;
        errors: ErrorsOf<R>;
      };
/**
 * 02 (d.ii): an Effect failure that is not a `TrpcError` is a compile error,
 * reported on the resolver's return expression.
 */
type CheckReturn<R> = [
  Exclude<SplitReturn<R>['errors'], AnyTrpcError>,
] extends [never]
  ? unknown
  : Effect.Effect<unknown, AnyTrpcError, never>;
export interface Schema<TIn, TOut = TIn> {
  '~standard': {
    types: {
      input: TIn;
      output: TOut;
    };
  };
}
export declare function schema<T>(): Schema<T>;
type inferOut<T> = T extends Schema<any, infer O> ? O : never;
export interface MiddlewareResult<TCtx> {
  readonly '~ctx': TCtx;
}
export type Next = <T extends object = {}>(opts?: {
  ctx: T;
}) => Promise<MiddlewareResult<T>>;
type MaybePromise<T> = T | Promise<T>;
type Overwrite<A, B> = Omit<A, keyof B> & B;
type CtxOf<R> = R extends MiddlewareResult<infer C> ? C : never;
/** Mapping middleware (replaces v11 `.errors()` formatters). */
export declare function mapErrors<$Err extends AnyTrpcError>(
  fn: (cause: unknown) => $Err | undefined,
): (opts: { next: Next }) => Promise<MiddlewareResult<{}> | $Err>;
export interface ErrorDef {
  status?: number;
  message?: string;
  data?: Schema<any>;
}
export type ErrorMap = Record<string, ErrorDef>;
type DeclaredData<D> = D extends {
  data: Schema<any, any>;
}
  ? inferOut<D['data']>
  : undefined;
export type DeclaredErrors<M extends ErrorMap> = {
  [K in keyof M & string]: TrpcError<K, DeclaredData<M[K]>>;
}[keyof M & string];
export type ErrorConstructors<M extends ErrorMap> = {
  [K in keyof M & string]: (
    ...args: DeclaredData<M[K]> extends undefined
      ? [
          opts?: {
            message?: string;
          },
        ]
      : [
          opts: {
            message?: string;
            data: DeclaredData<M[K]>;
          },
        ]
  ) => TrpcError<K, DeclaredData<M[K]>>;
};
export interface Procedure<TType, TInput, TOutput, TErrors> {
  '~trpc': {
    type: TType;
    input: TInput;
    output: TOutput;
    errors: TErrors;
  };
}
declare const unset: unique symbol;
type Unset = typeof unset;
interface ResolverOpts<TCtx, TInput, TMap extends ErrorMap> {
  ctx: TCtx;
  input: TInput extends Unset ? undefined : TInput;
  errors: ErrorConstructors<TMap>;
}
export interface ProcedureBuilder<
  TCtx,
  TInput,
  TOutputIn,
  TErrors,
  TMap extends ErrorMap,
> {
  input<$In>(
    schema: Schema<$In>,
  ): ProcedureBuilder<
    TCtx,
    $In,
    TOutputIn,
    TErrors | InputValidationError,
    TMap
  >;
  output<$Out>(
    schema: Schema<$Out>,
  ): ProcedureBuilder<TCtx, TInput, $Out, TErrors, TMap>;
  errors<const $Map extends ErrorMap>(
    map: $Map,
  ): ProcedureBuilder<
    TCtx,
    TInput,
    TOutputIn,
    TErrors | DeclaredErrors<$Map>,
    TMap & $Map
  >;
  /** Whole-return inference: infer `$Ret`, then split ctx and errors. */
  use<$Ret extends MaybePromise<MiddlewareResult<object> | AnyTrpcError>>(
    fn: (opts: { ctx: TCtx; next: Next }) => $Ret,
  ): ProcedureBuilder<
    Overwrite<TCtx, CtxOf<Awaited<$Ret>>>,
    TInput,
    TOutputIn,
    TErrors | Extract<Awaited<$Ret>, AnyTrpcError>,
    TMap
  >;
  /** Split inference: one type parameter each for ctx and errors. */
  useSplit<$Ctx extends object, $Err extends AnyTrpcError = never>(
    fn: (opts: {
      ctx: TCtx;
      next: Next;
    }) => MaybePromise<MiddlewareResult<$Ctx> | $Err>,
  ): ProcedureBuilder<
    Overwrite<TCtx, $Ctx>,
    TInput,
    TOutputIn,
    TErrors | $Err,
    TMap
  >;
  query<$Ret>(
    resolver: (
      opts: ResolverOpts<TCtx, TInput, TMap>,
    ) => TOutputIn extends Unset
      ? $Ret & CheckReturn<$Ret>
      : $Ret & MaybePromise<TOutputIn | AnyTrpcError> & CheckReturn<$Ret>,
  ): Procedure<
    'query',
    TInput extends Unset ? void : TInput,
    TOutputIn extends Unset ? SplitReturn<$Ret>['output'] : TOutputIn,
    TErrors | SplitReturn<$Ret>['errors']
  >;
}
export declare function initTrpc<TCtx extends object>(): {
  procedure: ProcedureBuilder<TCtx, Unset, Unset, never, {}>;
};
type AnyProcedure = Procedure<any, any, any, any>;
export type inferProcedureErrors<P> =
  P extends Procedure<any, any, any, infer E> ? E : never;
export type inferRouterErrors<R> = R extends AnyProcedure
  ? inferProcedureErrors<R>
  : {
      [K in keyof R]: inferRouterErrors<R[K]>;
    }[keyof R];
/** What the client sees: the typed union plus a catch-all, split by `defined`. */
export interface ClientError<
  TCode extends string,
  TData,
  TDefined extends boolean,
> {
  readonly code: TCode;
  readonly data: TData;
  readonly defined: TDefined;
  readonly message: string;
  readonly status: number;
}
export type DefinedClientError<E> =
  E extends TrpcError<infer C, infer D> ? ClientError<C, D, true> : never;
export type UnexpectedClientError = ClientError<
  BuiltinCode | 'CLIENT_ABORTED' | 'NETWORK',
  unknown,
  false
>;
export type ClientErrorOf<E> = DefinedClientError<E> | UnexpectedClientError;
/** The call result carries its error type as a phantom so `safe()` can read it. */
export interface TrpcPromise<T, E> extends Promise<T> {
  readonly '~error'?: E;
}
export type DecorateRouter<R> = {
  [K in keyof R]: R[K] extends Procedure<'query', infer I, infer O, infer E>
    ? {
        query(input: I): TrpcPromise<O, ClientErrorOf<E>>;
      }
    : DecorateRouter<R[K]>;
};
export declare function createClient<R>(): DecorateRouter<R>;
/** Q7.3 shapes. */
export declare function safe<T, E>(
  p: TrpcPromise<T, E>,
): Promise<[data: T, error: undefined] | [data: undefined, error: E]>;
export declare function safeErrorFirst<
  T,
  E extends {
    defined: boolean;
  },
>(
  p: TrpcPromise<T, E>,
): Promise<
  | [
      error: Extract<
        E,
        {
          defined: true;
        }
      >,
      data: undefined,
      isDefined: true,
    ]
  | [
      error: Extract<
        E,
        {
          defined: false;
        }
      >,
      data: undefined,
      isDefined: false,
    ]
  | [error: null, data: T, isDefined: false]
>;
export declare function safeObject<T, E>(
  p: TrpcPromise<T, E>,
): Promise<
  | {
      data: T;
      error: undefined;
    }
  | {
      data: undefined;
      error: E;
    }
>;
export {};
