/**
 * Type-level prototype for the composition answer's aside ("it could just be
 * `use` everywhere too with overloads? Spike that"): one `.use()` that takes
 * a middleware function, a plugin builder, or (on the root) an extension.
 * Copied from `../concat-plugins/core.ts`, with `concat` folded into `use`
 * overloads. Everything is `declare`d; none of this is decided API.
 */

export interface StandardSchemaV1<I = unknown, O = I> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: { readonly input: I; readonly output: O } | undefined;
  };
}
type InferIn<S> = S extends StandardSchemaV1<infer I, any> ? I : never;
type InferOut<S> = S extends StandardSchemaV1<any, infer O> ? O : never;

/** Stand-in for a validating library. */
export declare function schema<O, I = O>(): StandardSchemaV1<I, O>;

// --- helpers ----------------------------------------------------------------------

/** Exported: a published plugin's `.d.ts` must be able to name it (TS2527). */
export declare const unset: unique symbol;
export type Unset = typeof unset;

export interface TypeError<TMessage extends string, TDetail = never> {
  readonly '~typeError': TMessage;
  readonly '~detail': TDetail;
}

type MaybePromise<T> = T | Promise<T>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type Overwrite<A, B> = Simplify<Omit<A, keyof B> & B>;
type Merge<A, B> = A extends Unset ? B : B extends Unset ? A : Simplify<A & B>;
type Value<T> = T extends Unset ? undefined : T;

/** Keys of `TNeed` that `THave` lacks or has with an incompatible type. */
type Missing<THave, TNeed> = {
  [K in keyof TNeed]-?: K extends keyof THave
    ? [THave[K]] extends [TNeed[K]]
      ? never
      : K
    : undefined extends TNeed[K]
      ? never
      : K;
}[keyof TNeed];

// --- builder ----------------------------------------------------------------------

/** One mapped option bag (03 G-A). */
export interface BuilderDef {
  /** The root ctx: what the handler must provide; for a plugin, its requirement. */
  ctx: object;
  /** What middleware has added so far. */
  ctxAdded: object;
  meta: object;
  inputIn: unknown;
  inputOut: unknown;
}
type With<TDef extends BuilderDef, P extends Partial<BuilderDef>> = {
  [K in keyof BuilderDef]: K extends keyof P ? P[K] : TDef[K];
};
type CurrentCtx<TDef extends BuilderDef> = Overwrite<
  TDef['ctx'],
  TDef['ctxAdded']
>;

declare const ctxBrand: unique symbol;
export interface MiddlewareResult<TCtx> {
  readonly [ctxBrand]: TCtx;
}
export interface NextFn {
  (): Promise<MiddlewareResult<{}>>;
  <$Ctx extends object>(opts: { ctx: $Ctx }): Promise<MiddlewareResult<$Ctx>>;
}
type CtxOf<R> = Awaited<R> extends MiddlewareResult<infer C> ? C : never;

/** `unknown` when `plugin` may be concatenated onto a builder with `TDef`. */
type ConcatCheck<TDef extends BuilderDef, TPlugin extends BuilderDef> = [
  Missing<CurrentCtx<TDef>, TPlugin['ctx']>,
] extends [never]
  ? [Missing<TDef['meta'], TPlugin['meta']>] extends [never]
    ? unknown
    : TypeError<
        'use: the plugin needs meta this procedure does not declare',
        Missing<TDef['meta'], TPlugin['meta']>
      >
  : TypeError<
      'use: the plugin needs ctx this procedure does not have',
      Missing<CurrentCtx<TDef>, TPlugin['ctx']>
    >;

export interface Procedure<TInput, TOutput> {
  readonly '~types': { input: TInput; output: TOutput };
}

export interface ProcedureBuilder<TDef extends BuilderDef> {
  readonly '~trpc': TDef;

  use<$Ret extends MaybePromise<MiddlewareResult<object>>>(
    fn: (opts: {
      ctx: CurrentCtx<TDef>;
      input: Value<TDef['inputOut']>;
      meta: TDef['meta'];
      next: NextFn;
    }) => $Ret,
  ): ProcedureBuilder<
    With<TDef, { ctxAdded: Overwrite<TDef['ctxAdded'], CtxOf<$Ret>> }>
  >;
  /**
   * The plugin overload: appends another builder's middleware and inputs. Its
   * root ctx and meta are requirements, checked against this builder's.
   */
  use<$Plugin extends BuilderDef>(
    plugin: ProcedureBuilder<$Plugin> & ConcatCheck<TDef, $Plugin>,
  ): ProcedureBuilder<
    With<
      TDef,
      {
        ctxAdded: Overwrite<TDef['ctxAdded'], $Plugin['ctxAdded']>;
        inputIn: Merge<TDef['inputIn'], $Plugin['inputIn']>;
        inputOut: Merge<TDef['inputOut'], $Plugin['inputOut']>;
      }
    >
  >;

  input<$S extends StandardSchemaV1>(
    schema: $S,
  ): ProcedureBuilder<
    With<
      TDef,
      {
        inputIn: Merge<TDef['inputIn'], InferIn<$S>>;
        inputOut: Merge<TDef['inputOut'], InferOut<$S>>;
      }
    >
  >;

  meta(meta: TDef['meta']): ProcedureBuilder<TDef>;

  query<$Out>(
    fn: (opts: {
      ctx: CurrentCtx<TDef>;
      input: Value<TDef['inputOut']>;
      meta: TDef['meta'];
    }) => MaybePromise<$Out>,
  ): Procedure<Value<TDef['inputIn']>, $Out>;
}

type RootDef<TCtx extends object, TMeta extends object> = {
  ctx: TCtx;
  ctxAdded: {};
  meta: TMeta;
  inputIn: Unset;
  inputOut: Unset;
};

/** `unknown` when an extension fits a root: the ctx it needs is there. */
type RootCheck<TDef extends BuilderDef, TExt extends BuilderDef> = [
  Missing<CurrentCtx<TDef>, TExt['ctx']>,
] extends [never]
  ? unknown
  : TypeError<
      'use: the extension needs ctx this root does not have',
      Missing<CurrentCtx<TDef>, TExt['ctx']>
    >;

export interface TrpcRoot<TDef extends BuilderDef> {
  procedure: ProcedureBuilder<TDef>;
  /** Root middleware, the same overload a builder has. */
  use<$Ret extends MaybePromise<MiddlewareResult<object>>>(
    fn: (opts: {
      ctx: CurrentCtx<TDef>;
      input: Value<TDef['inputOut']>;
      meta: TDef['meta'];
      next: NextFn;
    }) => $Ret,
  ): TrpcRoot<
    With<TDef, { ctxAdded: Overwrite<TDef['ctxAdded'], CtxOf<$Ret>> }>
  >;
  // Last, so a failed call reports the extension's TypeError.
  /** Adds a root extension: its middleware and inputs, and its meta keys. */
  use<$Ext extends BuilderDef>(
    extension: ProcedureBuilder<$Ext> & RootCheck<TDef, $Ext>,
  ): TrpcRoot<
    With<
      TDef,
      {
        meta: Simplify<TDef['meta'] & $Ext['meta']>;
        ctxAdded: Overwrite<TDef['ctxAdded'], $Ext['ctxAdded']>;
        inputIn: Merge<TDef['inputIn'], $Ext['inputIn']>;
        inputOut: Merge<TDef['inputOut'], $Ext['inputOut']>;
      }
    >
  >;
}

/** One option bag, no `.create()`. */
export declare function initTrpc<
  TConfig extends { ctx?: object; meta?: object } = {},
>(): TrpcRoot<
  RootDef<
    TConfig['ctx'] extends object ? TConfig['ctx'] : {},
    TConfig['meta'] extends object ? TConfig['meta'] : {}
  >
>;

export type inferInput<P> = P extends Procedure<infer I, any> ? I : never;
