/**
 * Type-level prototype of 02 (b) S1/S2 and 06 (g): the Effect `R` channel on
 * procedures, routers and the handler `layer`, plus Effect middleware that
 * provides a service (M-A). `declare`-only; names follow the proposal text and
 * none of this is decided API.
 */
import type * as Effect from 'effect/Effect';
import type * as Layer from 'effect/Layer';
import type * as Scope from 'effect/Scope';

export interface TypeError<TMessage extends string, TDetail = never> {
  readonly '~typeError': TMessage;
  readonly '~detail': TDetail;
}

declare const inferred: unique symbol;
/** `services` not declared in `initTrpc.create()`: S1, the router carries `R`. */
export type Inferred = typeof inferred;

// --- middleware (06 (g) M-A) ----------------------------------------------------------

/** Marker success type, as in `effect/rpc`'s `RpcMiddleware.SuccessValue`. */
export interface SuccessValue {
  readonly '~success': unique symbol;
}

export interface EffectMiddleware<TCtx, TProvides, TRequires, TErr> {
  readonly '~provides': TProvides;
  readonly '~requires': TRequires;
  readonly '~ctx': TCtx;
  readonly '~err': TErr;
}

// --- procedures --------------------------------------------------------------------

export interface Procedure<TOutput, TErr, TServices> {
  readonly '~types': { output: TOutput; errors: TErr; services: TServices };
}

type ServiceCheck<TDeclared, TNeeded> = [TDeclared] extends [Inferred]
  ? unknown
  : [TNeeded] extends [TDeclared]
    ? unknown
    : TypeError<
        'resolver requires services not declared in initTrpc.create()',
        Exclude<TNeeded, TDeclared>
      >;

export interface ProcedureBuilder<TCtx, TDeclared, TProvided, TRequired, TErr> {
  use<$P, $R, $E>(
    mw: EffectMiddleware<TCtx, $P, $R, $E> & ServiceCheck<TDeclared, $R>,
  ): ProcedureBuilder<
    TCtx,
    TDeclared,
    TProvided | $P,
    TRequired | $R,
    TErr | $E
  >;

  query<$A, $E = never, $R = never>(
    fn: (opts: {
      ctx: TCtx;
    }) => Effect.Effect<$A, $E, $R> &
      ServiceCheck<TDeclared, Exclude<$R, TProvided>>,
  ): Procedure<$A, TErr | $E, Exclude<$R, TProvided> | TRequired>;
}

export declare const initTrpc: {
  create<
    TConfig extends { ctx: object; services?: unknown } = { ctx: {} },
  >(): Root<
    TConfig['ctx'],
    'services' extends keyof TConfig ? TConfig['services'] : Inferred
  >;
};

export interface Root<TCtx, TDeclared> {
  readonly '~declared': TDeclared;
  procedure: ProcedureBuilder<TCtx, TDeclared, never, never, never>;
  middleware: {
    effect<TConfig extends { provides?: unknown } = {}>(): <
      $E = never,
      $R = never,
    >(
      fn: (opts: {
        ctx: TCtx;
        next: () => Effect.Effect<SuccessValue, never, Provides<TConfig>>;
      }) => Effect.Effect<SuccessValue, $E, $R> &
        ProvideCheck<Provides<TConfig>, $R>,
    ) => EffectMiddleware<
      TCtx,
      Provides<TConfig>,
      Exclude<$R, Scope.Scope>,
      $E
    >;
  };
}
/**
 * `next()` requires the provided services, so a body that forgets to provide
 * them returns an Effect that still requires them. Unlike `effect/rpc`, whose
 * middleware declares `requires` up front, `$R` is inferred here, so the
 * check has to be explicit.
 */
type ProvideCheck<TProvides, $R> = [Extract<$R, TProvides>] extends [never]
  ? unknown
  : TypeError<
      'middleware does not provide the services it declares',
      Extract<$R, TProvides>
    >;
type Provides<TConfig> = 'provides' extends keyof TConfig
  ? TConfig['provides']
  : never;

// --- routers and the handler --------------------------------------------------------

export type AnyProcedure = Procedure<any, any, any>;
export interface AnyRouter {
  [key: string]: AnyProcedure | AnyRouter;
}

/** S1: the union of every procedure's services, recursively. */
export type inferRouterServices<TRouter> =
  TRouter extends Procedure<any, any, infer R>
    ? R
    : { [K in keyof TRouter]: inferRouterServices<TRouter[K]> }[keyof TRouter];

type RequiredServices<TRoot, TRouter> =
  TRoot extends Root<any, infer D>
    ? [D] extends [Inferred]
      ? inferRouterServices<TRouter>
      : D
    : never;

/** Names the missing services instead of Layer's structural variance error. */
type LayerCheck<$L extends Layer.Any, TRequired> = [
  Exclude<TRequired, Layer.Success<$L>>,
] extends [never]
  ? unknown
  : TypeError<
      'layer does not provide every required service',
      Exclude<TRequired, Layer.Success<$L>>
    >;

/**
 * `root` stands in for wherever the declared set comes from. With plain-object
 * routers (08 A) nothing carries it, so the handler has to be given `t` or
 * read it off a leaf procedure.
 */
export declare function createHandler<
  TRoot extends Root<any, any>,
  TRouter extends AnyRouter,
  $L extends Layer.Layer<any, unknown, never>,
>(opts: {
  root: TRoot;
  router: TRouter;
  layer: $L & LayerCheck<$L, RequiredServices<TRoot, TRouter>>;
}): { fetch(request: Request): Promise<Response>; dispose(): Promise<void> };
