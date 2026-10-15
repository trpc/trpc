/**
 * Type-level prototype of 05 (b)/(c) and 06 (c)/(d): `type<T>()`, input
 * chaining (C-A), standalone dependency-declaring middleware, `mapInput` and
 * the `ok()` short-circuit. Everything is `declare`d; names follow the
 * proposal text and none of this is decided API.
 */

// --- schemas ----------------------------------------------------------------------

export interface StandardSchemaV1<I = unknown, O = I> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: { readonly input: I; readonly output: O } | undefined;
  };
}
type InferIn<S> = S extends StandardSchemaV1<infer I, any> ? I : never;
type InferOut<S> = S extends StandardSchemaV1<any, infer O> ? O : never;

/** Stand-in for a validating library (zod, valibot, Effect Schema). */
export declare function schema<O, I = O>(): StandardSchemaV1<I, O>;
/** 05 (b): a pass-through Standard Schema, no runtime validation. */
export declare function type<T>(): StandardSchemaV1<T, T>;

// --- helpers ----------------------------------------------------------------------

declare const unset: unique symbol;
export type Unset = typeof unset;

/** Shows up in the error message when a check fails. */
export interface TypeError<TMessage extends string, TDetail = never> {
  readonly '~typeError': TMessage;
  readonly '~detail': TDetail;
}

type MaybePromise<T> = T | Promise<T>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type Overwrite<A, B> = Simplify<Omit<A, keyof B> & B>;
type IsObject<T> = [T] extends [object]
  ? [T] extends [readonly unknown[]]
    ? false
    : true
  : false;

// --- input chaining (05 C-A) --------------------------------------------------------

type Conflicts<A, B> = {
  [K in keyof A & keyof B]: [A[K] & B[K]] extends [never] ? K : never;
}[keyof A & keyof B];

/** `unknown` when `next` may be chained onto `prev`, otherwise a `TypeError`. */
type ChainCheck<TPrev, TNext> = TPrev extends Unset
  ? unknown
  : IsObject<TPrev> extends false
    ? TypeError<'input chaining: the previous input is not an object', TPrev>
    : IsObject<TNext> extends false
      ? TypeError<'input chaining: only object schemas can be chained', TNext>
      : [Conflicts<TPrev, TNext>] extends [never]
        ? unknown
        : TypeError<
            'input chaining: keys with incompatible types',
            Conflicts<TPrev, TNext>
          >;

type Merge<TPrev, TNext> = TPrev extends Unset
  ? TNext
  : Simplify<TPrev & TNext>;
type Value<T> = T extends Unset ? undefined : T;

// --- middleware ----------------------------------------------------------------------

declare const ctxBrand: unique symbol;
declare const shortBrand: unique symbol;

/** What `next()` resolves to; `data` is unknown until the terminal. */
export type MiddlewareResult<TCtx> = (
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly error: Error }
) & { readonly [ctxBrand]: TCtx };

/** What `ok(data)` returns: a successful result that skips the resolver. */
export interface ShortCircuit<TData> {
  readonly ok: true;
  readonly data: TData;
  readonly [shortBrand]: TData;
}

export interface NextFn {
  (): Promise<MiddlewareResult<{}>>;
  <$Ctx extends object>(opts: { ctx: $Ctx }): Promise<MiddlewareResult<$Ctx>>;
}

export interface MiddlewareOpts<TCtx, TInput, TMeta> {
  ctx: TCtx;
  input: TInput;
  meta: TMeta;
  path: string;
  next: NextFn;
  ok: <$Data>(data: $Data) => ShortCircuit<$Data>;
}

type AnyMiddlewareReturn = MaybePromise<
  MiddlewareResult<object> | ShortCircuit<unknown>
>;
type CtxOf<R> =
  Awaited<R> extends infer A
    ? A extends MiddlewareResult<infer C>
      ? C
      : never
    : never;
type ShortOf<R> =
  Awaited<R> extends infer A
    ? A extends ShortCircuit<infer D>
      ? D
      : never
    : never;

/**
 * 06 (d): a standalone middleware is just a function whose `opts` declare what
 * it needs. `.use()` then checks requirements through ordinary parameter
 * contravariance, so no special overload is needed.
 */
export declare function middleware<
  TReq extends { ctx?: object; input?: unknown; meta?: object } = {},
>(): <$Ret extends AnyMiddlewareReturn>(
  fn: (
    opts: MiddlewareOpts<
      TReq['ctx'] extends object ? TReq['ctx'] : {},
      'input' extends keyof TReq ? TReq['input'] : unknown,
      TReq['meta'] extends object ? TReq['meta'] : {}
    >,
  ) => $Ret,
) => (
  opts: MiddlewareOpts<
    TReq['ctx'] extends object ? TReq['ctx'] : {},
    'input' extends keyof TReq ? TReq['input'] : unknown,
    TReq['meta'] extends object ? TReq['meta'] : {}
  >,
) => $Ret;

// --- builder -------------------------------------------------------------------------

type ShortCheck<TShort, TOutput> = [TShort] extends [TOutput]
  ? unknown
  : TypeError<
      'a middleware short-circuits with a value this procedure does not output',
      Exclude<TShort, TOutput>
    >;

export interface Procedure<TType, TInputIn, TOutput> {
  readonly '~types': { type: TType; input: TInputIn; output: TOutput };
}

export interface ProcedureBuilder<
  TCtx,
  TMeta,
  TInputIn,
  TInput,
  TOutput,
  TShort,
> {
  input<$S extends StandardSchemaV1>(
    schema: $S & ChainCheck<TInput, InferOut<$S>>,
  ): ProcedureBuilder<
    TCtx,
    TMeta,
    Merge<TInputIn, InferIn<$S>>,
    Merge<TInput, InferOut<$S>>,
    TOutput,
    TShort
  >;

  output<$S extends StandardSchemaV1>(
    schema: $S,
  ): ProcedureBuilder<TCtx, TMeta, TInputIn, TInput, InferOut<$S>, TShort>;

  /** Inline middleware, or a standalone one from `middleware()`. */
  use<$Ret extends AnyMiddlewareReturn>(
    fn: (opts: MiddlewareOpts<TCtx, Value<TInput>, TMeta>) => $Ret,
  ): ProcedureBuilder<
    Overwrite<TCtx, CtxOf<$Ret>>,
    TMeta,
    TInputIn,
    TInput,
    TOutput,
    TShort | ShortOf<$Ret>
  >;
  /** 06 (d) open question: oRPC-style `mapInput`. */
  use<$In, $Ret extends AnyMiddlewareReturn>(
    fn: (opts: MiddlewareOpts<TCtx, $In, TMeta>) => $Ret,
    mapInput: (input: Value<TInput>) => $In,
  ): ProcedureBuilder<
    Overwrite<TCtx, CtxOf<$Ret>>,
    TMeta,
    TInputIn,
    TInput,
    TOutput,
    TShort | ShortOf<$Ret>
  >;

  query<$Ret>(
    fn: (opts: {
      ctx: TCtx;
      input: Value<TInput>;
    }) => $Ret &
      (TOutput extends Unset
        ? ShortCheck<TShort, Awaited<$Ret>>
        : MaybePromise<TOutput> & ShortCheck<TShort, TOutput>),
  ): Procedure<
    'query',
    Value<TInputIn>,
    TOutput extends Unset ? Awaited<$Ret> : TOutput
  >;
}

export declare function initTrpc<
  TConfig extends { ctx: object; meta?: object },
>(): {
  procedure: ProcedureBuilder<
    TConfig['ctx'],
    TConfig['meta'] extends object ? TConfig['meta'] : {},
    Unset,
    Unset,
    Unset,
    never
  >;
};

export type inferInput<P> = P extends Procedure<any, infer I, any> ? I : never;
export type inferOutput<P> = P extends Procedure<any, any, infer O> ? O : never;
