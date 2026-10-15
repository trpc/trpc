/**
 * Type-level prototype of 09 (contract builder, `implement()`, completeness,
 * `inferContract`, Q9.1 options bag, Q9.2 `.implements()`) and 08 (plain-object
 * routers, merging by spread, `lazy`). `declare`-only; names follow the proposal
 * text and none of this is decided API.
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
export declare function schema<O, I = O>(): StandardSchemaV1<I, O>;

export interface TypeError<TMessage extends string, TDetail = never> {
  readonly '~typeError': TMessage;
  readonly '~detail': TDetail;
}

type ProcedureType = 'query' | 'mutation';
type MaybePromise<T> = T | Promise<T>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type ErrorMap = Record<string, { status?: number; data?: StandardSchemaV1 }>;
interface Route {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path?: `/${string}`;
}

// --- contracts ----------------------------------------------------------------------

/** A procedure without a resolver: what clients and integrations accept. */
export interface ContractProcedure<
  TType extends ProcedureType,
  TInputIn,
  TInput,
  TOutput,
  TErrors extends ErrorMap,
> {
  readonly '~contract': {
    type: TType;
    input: TInputIn;
    parsedInput: TInput;
    output: TOutput;
    errors: TErrors;
  };
}
export type AnyContractProcedure = ContractProcedure<any, any, any, any, any>;
export interface AnyContractRouter {
  [key: string]: AnyContractProcedure | AnyContractRouter;
}

/** Q9.1 (a): resolver-less terminals on a builder that mirrors the procedure builder. */
export interface ContractBuilder<
  TInputIn,
  TInput,
  TOutput,
  TErrors extends ErrorMap,
> {
  route(route: Route): ContractBuilder<TInputIn, TInput, TOutput, TErrors>;
  input<$S extends StandardSchemaV1>(
    schema: $S,
  ): ContractBuilder<InferIn<$S>, InferOut<$S>, TOutput, TErrors>;
  output<$S extends StandardSchemaV1>(
    schema: $S,
  ): ContractBuilder<TInputIn, TInput, InferOut<$S>, TErrors>;
  errors<const $E extends ErrorMap>(
    errors: $E,
  ): ContractBuilder<TInputIn, TInput, TOutput, Simplify<TErrors & $E>>;
  query(): ContractProcedure<'query', TInputIn, TInput, TOutput, TErrors>;
  mutation(): ContractProcedure<'mutation', TInputIn, TInput, TOutput, TErrors>;
}

export declare const contract: {
  create<TConfig extends { meta?: object } = {}>(): ContractBuilder<
    undefined,
    undefined,
    unknown,
    {}
  > & {
    /** Q9.1 (b): the options-bag alternative. */
    procedure<
      const TType extends ProcedureType,
      $I extends StandardSchemaV1 | undefined = undefined,
      $O extends StandardSchemaV1 | undefined = undefined,
      const $E extends ErrorMap = {},
    >(def: {
      type: TType;
      input?: $I;
      output?: $O;
      errors?: $E;
      route?: Route;
      meta?: TConfig['meta'];
    }): ContractProcedure<
      TType,
      $I extends StandardSchemaV1 ? InferIn<$I> : undefined,
      $I extends StandardSchemaV1 ? InferOut<$I> : undefined,
      $O extends StandardSchemaV1 ? InferOut<$O> : unknown,
      $E
    >;
  };
};

// --- implementation-first procedures and routers -------------------------------------

export interface Procedure<
  TType extends ProcedureType,
  TInputIn,
  TInput,
  TOutput,
  TErrors extends ErrorMap,
  TCtx,
> extends ContractProcedure<TType, TInputIn, TInput, TOutput, TErrors> {
  readonly '~ctx': TCtx;
}
export type AnyProcedure = Procedure<any, any, any, any, any, any>;

declare const lazyBrand: unique symbol;
export interface Lazy<T> {
  readonly [lazyBrand]: T;
}
/** 08: default or named export; a named one is picked with `.then(m => m.x)`. */
export declare function lazy<T>(
  load: () => Promise<T>,
): Lazy<T extends { default: infer D } ? D : T>;

export interface AnyRouter {
  [key: string]: AnyContractProcedure | AnyRouter | Lazy<any>;
}

type Resolver<TCtx, TInput, TOutput, TErrors> = (opts: {
  ctx: TCtx;
  input: TInput;
  errors: { [K in keyof TErrors]: (opts?: { data?: unknown }) => Error };
}) => MaybePromise<TOutput>;

export interface ProcedureBuilder<
  TCtx,
  TInputIn,
  TInput,
  TErrors extends ErrorMap,
> {
  input<$S extends StandardSchemaV1>(
    schema: $S,
  ): ProcedureBuilder<TCtx, InferIn<$S>, InferOut<$S>, TErrors>;
  use<$Ctx extends object>(
    fn: (opts: {
      ctx: TCtx;
      next: <C extends object>(o: { ctx: C }) => C;
    }) => $Ctx,
  ): ProcedureBuilder<Simplify<TCtx & $Ctx>, TInputIn, TInput, TErrors>;
  query<$O>(
    fn: Resolver<TCtx, TInput, $O, TErrors>,
  ): Procedure<'query', TInputIn, TInput, Awaited<$O>, TErrors, TCtx>;
  mutation<$O>(
    fn: Resolver<TCtx, TInput, $O, TErrors>,
  ): Procedure<'mutation', TInputIn, TInput, Awaited<$O>, TErrors, TCtx>;
  /** Q9.2 (b): `t.procedure.implements(contract.post.byId)`. */
  implements<$C extends AnyContractProcedure>(
    c: $C,
  ): ImplementerProcedure<TCtx, $C>;
}

// --- implement() ---------------------------------------------------------------------

type C<P extends AnyContractProcedure> = P['~contract'];

/** A leaf of `t.implement(contract)`: `.use()` and the matching terminal only. */
export type ImplementerProcedure<TCtx, P extends AnyContractProcedure> = {
  use<$Ctx extends object>(
    fn: (opts: {
      ctx: TCtx;
      next: <X extends object>(o: { ctx: X }) => X;
    }) => $Ctx,
  ): ImplementerProcedure<Simplify<TCtx & $Ctx>, P>;
} & {
  [K in C<P>['type']]: (
    fn: Resolver<TCtx, C<P>['parsedInput'], C<P>['output'], C<P>['errors']>,
  ) => Procedure<
    C<P>['type'],
    C<P>['input'],
    C<P>['parsedInput'],
    C<P>['output'],
    C<P>['errors'],
    TCtx
  >;
};

export type Implementer<TCtx, TContract> =
  TContract extends AnyContractProcedure
    ? ImplementerProcedure<TCtx, TContract>
    : { [K in keyof TContract]: Implementer<TCtx, TContract[K]> };

/** What `impl.router()` accepts: every contract key, implemented, and nothing else. */
export type ImplementedRouter<TContract> =
  TContract extends ContractProcedure<
    infer T,
    infer I,
    infer PI,
    infer O,
    infer E
  >
    ? Procedure<T, I, PI, O, E, any>
    : { [K in keyof TContract]: ImplementedRouter<TContract[K]> };

export interface Root<TCtx> {
  procedure: ProcedureBuilder<TCtx, undefined, undefined, {}>;
  implement<TContract extends AnyContractRouter>(
    contract: TContract,
  ): Implementer<TCtx, TContract> & {
    /** Not generic, so excess-property checks reject keys not in the contract. */
    router(routes: ImplementedRouter<TContract>): ImplementedRouter<TContract>;
  };
}
export declare function initTrpc<TCtx extends object>(): Root<TCtx>;

// --- reducing routers to contracts ----------------------------------------------------

/** 01/09: strips ctx and unwraps `lazy`, so the result references no server types. */
export type inferContract<TRouter> =
  TRouter extends Lazy<infer L>
    ? inferContract<L>
    : TRouter extends ContractProcedure<
          infer T,
          infer I,
          infer PI,
          infer O,
          infer E
        >
      ? ContractProcedure<T, I, PI, O, E>
      : { [K in keyof TRouter]: inferContract<TRouter[K]> };

// --- client ----------------------------------------------------------------------------

export type DecorateClient<T> =
  T extends Lazy<infer L>
    ? DecorateClient<L>
    : T extends ContractProcedure<infer TType, infer I, any, infer O, any>
      ? TType extends 'query'
        ? { query: (input: I) => Promise<O> }
        : { mutate: (input: I) => Promise<O> }
      : { [K in keyof T]: DecorateClient<T[K]> };

/** Accepts a contract or a router; both reduce to the same client. */
export declare function createClient<T>(): DecorateClient<inferContract<T>>;

// --- 08 merging ---------------------------------------------------------------------

type DuplicateKeys<TParts extends readonly object[]> = TParts extends readonly [
  infer A extends object,
  ...infer Rest extends readonly object[],
]
  ? (keyof A & keyof MergeAll<Rest>) | DuplicateKeys<Rest>
  : never;
type MergeAll<TParts extends readonly object[]> = TParts extends readonly [
  infer A,
  ...infer Rest extends readonly object[],
]
  ? A & MergeAll<Rest>
  : {};

/** The helper 08's "duplicate keys are a type error" needs: spread can't do it. */
export declare function mergeRouters<const TParts extends readonly AnyRouter[]>(
  ...parts: TParts &
    ([DuplicateKeys<TParts>] extends [never]
      ? unknown
      : TypeError<'duplicate router keys', DuplicateKeys<TParts>>)
): Simplify<MergeAll<TParts>>;
