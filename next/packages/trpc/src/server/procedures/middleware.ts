import type { Effect } from 'effect';
import type { AnyTrpcError, TrpcError } from '../../internal/error.ts';
import type {
  MaybePromise,
  ProcedureType,
  TypeError,
  Unset,
} from '../../internal/types.ts';

/**
 * Sets response headers and status (04 (d) R-A). Inside a batch, headers from
 * every call are merged and `status` is ignored. Over WebSockets and message
 * ports both are ignored.
 *
 * @example
 * ```ts
 * t.procedure.mutation(({ response }) => {
 *   response.headers.append('set-cookie', 'session=…; HttpOnly');
 *   response.status = 201;
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface ResponseHandle {
  readonly headers: Headers;
  /** The success status. Errors use their own status. */
  status: number | undefined;
}

/**
 * What `next()` resolves to. `'~ctx'` and `'~input'` are phantoms that carry
 * the ctx the middleware added and the input it passed on (`Unset` when it
 * passed the input unchanged), so the builder can infer them.
 *
 * @since 0.1.0
 * @stability stable
 */
export type MiddlewareResult<TCtx, TInput = Unset> = (
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly error: AnyTrpcError }
) & { readonly '~ctx'?: TCtx; readonly '~input'?: TInput };

/**
 * The input after a middleware: the one it passed to `next({ input })`, or
 * the current one.
 * @since 0.1.0
 * @stability stable
 */
export type NextInput<TCurrent, $Input> = [$Input] extends [Unset]
  ? TCurrent
  : $Input;

/**
 * A short-circuit result from {@link ok}.
 * @since 0.1.0
 * @stability stable
 */
export interface OkResult<T> {
  readonly ok: true;
  /** Typed through `'~short'`, so that `next()` results don't infer as shorts. */
  readonly data: unknown;
  readonly '~ok': true;
  readonly '~short'?: T;
}

/**
 * Ends the chain with `data` instead of calling `next()`. The
 * resolver does not run, but output validation does. The builder checks
 * `data` against the procedure's output at the terminal.
 *
 * @example
 * ```ts
 * const cached = t.procedure.use(async ({ path, next }) => {
 *   const hit = cache.get(path);
 *   return hit ? ok(hit) : next();
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function ok<const T>(data: T): OkResult<T> {
  return { ok: true, data, '~ok': true };
}

/**
 * Calls the rest of the chain, optionally extending `ctx` or replacing the
 * input. A replaced input is what later steps and the resolver get, typed as
 * passed.
 * @since 0.1.0
 * @stability stable
 */
export interface NextFn {
  (): Promise<MiddlewareResult<{}>>;
  <$Ctx extends object>(opts: { ctx: $Ctx }): Promise<MiddlewareResult<$Ctx>>;
  <$Input, $Ctx extends object = {}>(opts: {
    ctx?: $Ctx;
    input: $Input;
  }): Promise<MiddlewareResult<$Ctx, $Input>>;
}

/**
 * The options a middleware receives.
 * @since 0.1.0
 * @stability stable
 */
export interface MiddlewareOpts<TCtx, TInput, TMeta> {
  readonly ctx: TCtx;
  /** The input parsed so far: inputs declared after this middleware are not in it. */
  readonly input: TInput;
  readonly meta: TMeta;
  /** `'post.byId'` */
  readonly path: string;
  readonly type: ProcedureType;
  /** Aborted when the client goes away. */
  readonly signal: AbortSignal;
  readonly response: ResponseHandle;
  readonly next: NextFn;
}

/**
 * A middleware: calls `next()` (optionally extending `ctx` or replacing the input), returns
 * {@link ok} to short-circuit with a value, or returns a `TrpcError` to fail.
 * A returned error joins the procedure's typed error union.
 *
 * @since 0.1.0
 * @stability stable
 */
export type MiddlewareFunction<
  TCtx,
  TInput,
  TMeta,
  $Ctx extends object,
  $Err extends MiddlewareErrors,
  $Ok = never,
  $Input = Unset,
> = (
  opts: MiddlewareOpts<TCtx, TInput, TMeta>,
) => MaybePromise<MiddlewareResult<$Ctx, $Input> | $Err | OkResult<$Ok>>;

/**
 * The bound of a middleware's `$Err`. When every branch returns `next()` or
 * `ok()`, TypeScript still infers the whole return type into `$Err`; with an
 * `AnyTrpcError` bound that candidate fails and `$Err` widens to
 * `AnyTrpcError`. Accepting it here and taking `Extract<$Err, AnyTrpcError>`
 * keeps such a middleware from adding errors.
 * @internal
 */
export type MiddlewareErrors =
  | AnyTrpcError
  | MaybePromise<MiddlewareResult<any, any> | OkResult<any>>;

/**
 * What a standalone middleware needs from the procedure it is used on.
 * @since 0.1.0
 * @stability stable
 */
export interface MiddlewareRequirements {
  ctx?: object;
  meta?: object;
  input?: unknown;
}

/** @internal */
export type ReqCtx<T extends MiddlewareRequirements> = T['ctx'] extends object
  ? T['ctx']
  : {};
/** @internal */
export type ReqMeta<T extends MiddlewareRequirements> = T['meta'] extends object
  ? T['meta']
  : {};
/** @internal */
export type ReqInput<T extends MiddlewareRequirements> = 'input' extends keyof T
  ? T['input']
  : unknown;

// --- Effect middleware (06 (g) M-A) ------------------------------------------------

/**
 * What an Effect middleware's `next()` succeeds with. `data` is the rest of
 * the chain's result; the phantoms carry ctx and input as in
 * {@link MiddlewareResult}.
 * @since 0.1.0
 * @stability stable
 */
export interface NextResult<TCtx, TInput = Unset> {
  readonly ok: true;
  readonly data: unknown;
  readonly '~ctx'?: TCtx;
  readonly '~input'?: TInput;
}

/**
 * What an Effect middleware's `next()` fails with: the error a later step
 * failed with, as clients will get it (a thrown value is an
 * `INTERNAL_SERVER_ERROR`). Its `_tag` is its code, so
 * `Effect.catchTag('NOT_FOUND', …)` takes it. The step that failed already
 * put it in the procedure's error union, so failing with it again adds
 * nothing, and it keeps its cause.
 * @since 0.1.0
 * @stability stable
 */
export interface NextError extends TrpcError<string, unknown> {
  /** Type only: marks an error from `next()`. */
  readonly '~next': true;
}

/**
 * `next()` for Effect middleware: fails with the rest of the chain's error,
 * so `Effect.catchTag`, `Effect.retry`, `Effect.timeout` and `Effect.onExit`
 * see it. It requires the services the middleware declares in `provides`,
 * so a body that forgets to provide them is a type error.
 * @since 0.1.0
 * @stability stable
 */
export interface EffectNextFn<TProvides> {
  (): Effect.Effect<NextResult<{}>, NextError, TProvides>;
  <$Ctx extends object>(opts: {
    ctx: $Ctx;
  }): Effect.Effect<NextResult<$Ctx>, NextError, TProvides>;
  <$Input, $Ctx extends object = {}>(opts: {
    ctx?: $Ctx;
    input: $Input;
  }): Effect.Effect<NextResult<$Ctx, $Input>, NextError, TProvides>;
}

/**
 * The options an Effect middleware receives.
 * @since 0.1.0
 * @stability stable
 */
export interface EffectMiddlewareOpts<
  TCtx,
  TInput,
  TMeta,
  TProvides,
> extends Omit<MiddlewareOpts<TCtx, TInput, TMeta>, 'next'> {
  readonly next: EffectNextFn<TProvides>;
}

/**
 * A middleware whose body is an `Effect`. Its failures join the error union
 * (those from `next()` are there already), its requirements join the
 * procedure's services, and the services it `provides` are removed from
 * what later steps require.
 * @since 0.1.0
 * @stability stable
 */
export interface EffectMiddleware<
  TCtx,
  TInput,
  TMeta,
  $Ctx extends object,
  $Err extends AnyTrpcError,
  $R,
  $Provides,
  $Ok = never,
  $Input = Unset,
> {
  readonly '~effectMiddleware': (
    opts: EffectMiddlewareOpts<TCtx, TInput, TMeta, $Provides>,
  ) => Effect.Effect<NextResult<$Ctx, $Input> | OkResult<$Ok>, $Err, $R>;
  readonly '~types'?: { provides: $Provides; requires: $R };
}

/** @internal */
export type EffectBodyCheck<$E, $R, $Provides> = [
  Exclude<$E, AnyTrpcError>,
] extends [never]
  ? [Extract<$R, $Provides>] extends [never]
    ? unknown
    : TypeError<
        'Effect middleware: the body does not provide the services it declares',
        Extract<$R, $Provides>
      >
  : TypeError<
      'Effect middleware: map failures to a TrpcError (e.g. Effect.catchTag) first',
      Exclude<$E, AnyTrpcError>
    >;

/**
 * What an Effect middleware declares.
 * @since 0.1.0
 * @stability stable
 */
export interface EffectMiddlewareDecl extends MiddlewareRequirements {
  /** Services the middleware provides to everything after it. */
  provides?: unknown;
}

type ProvidesOf<T extends EffectMiddlewareDecl> = 'provides' extends keyof T
  ? T['provides']
  : never;

type BodyNext<A> = A extends OkResult<any> ? never : A;
type BodyCtx<A> = [BodyNext<A>] extends [never]
  ? {}
  : BodyNext<A> extends NextResult<infer C extends object, any>
    ? C
    : never;
type BodyInput<A> = [BodyNext<A>] extends [never]
  ? Unset
  : BodyNext<A> extends NextResult<any, infer I>
    ? I
    : never;
type BodyOk<A> = A extends OkResult<infer T> ? T : never;

/**
 * Infers the body's whole `Effect` and reads its parts from it, so a body
 * like `user ? next() : Effect.fail(err)` gets both branches' errors:
 * inferring `E` itself would pick one branch's, as `Effect.flatMap` does.
 * @internal
 */
export type EffectMiddlewareFactory<TCtx, TInput, TMeta, $Provides> = <
  $Body extends Effect.Effect<
    NextResult<object, unknown> | OkResult<unknown>,
    unknown,
    unknown
  >,
>(
  fn: (
    opts: EffectMiddlewareOpts<TCtx, TInput, TMeta, $Provides>,
  ) => $Body &
    EffectBodyCheck<Effect.Error<$Body>, Effect.Services<$Body>, $Provides>,
) => EffectMiddleware<
  TCtx,
  TInput,
  TMeta,
  BodyCtx<Effect.Success<$Body>>,
  Exclude<Extract<Effect.Error<$Body>, AnyTrpcError>, NextError>,
  Exclude<Effect.Services<$Body>, $Provides>,
  $Provides,
  BodyOk<Effect.Success<$Body>>,
  BodyInput<Effect.Success<$Body>>
>;

/** @internal */
export const makeEffectMiddleware = (fn: (opts: any) => unknown): any => ({
  '~effectMiddleware': fn,
});

/** @internal */
export const isEffectMiddleware = (
  value: unknown,
): value is { '~effectMiddleware': (opts: any) => unknown } =>
  typeof value === 'object' && value !== null && '~effectMiddleware' in value;

// --- standalone middleware ---------------------------------------------------------

interface MiddlewareFactory {
  /**
   * Declares a middleware outside any `t`, typed by what it needs. `.use()`
   * checks those needs against the procedure, so the same middleware can be
   * published in its own package.
   *
   * @example
   * ```ts
   * export const requireUser = middleware<{ ctx: { user: User | null } }>()(
   *   ({ ctx, next }) =>
   *     ctx.user
   *       ? next({ ctx: { user: ctx.user } })
   *       : error({ code: 'UNAUTHORIZED' }),
   * );
   * ```
   */
  <TReq extends MiddlewareRequirements = {}>(): <
    $Ctx extends object = {},
    $Err extends MiddlewareErrors = never,
    $Ok = never,
    $Input = Unset,
  >(
    fn: MiddlewareFunction<
      ReqCtx<TReq>,
      ReqInput<TReq>,
      ReqMeta<TReq>,
      $Ctx,
      $Err,
      $Ok,
      $Input
    >,
  ) => MiddlewareFunction<
    ReqCtx<TReq>,
    ReqInput<TReq>,
    ReqMeta<TReq>,
    $Ctx,
    Extract<$Err, AnyTrpcError>,
    $Ok,
    $Input
  >;
  /**
   * A standalone Effect middleware. Declare the services it
   * provides; procedures after it no longer require them.
   *
   * @example
   * ```ts
   * export const withUser = middleware.effect<{
   *   ctx: { token: string };
   *   provides: CurrentUser;
   * }>()(({ ctx, next }) =>
   *   Effect.gen(function* () {
   *     const user = yield* verify(ctx.token);
   *     return yield* next().pipe(Effect.provideService(CurrentUser, user));
   *   }),
   * );
   * ```
   */
  effect<TDecl extends EffectMiddlewareDecl = {}>(): EffectMiddlewareFactory<
    ReqCtx<TDecl>,
    ReqInput<TDecl>,
    ReqMeta<TDecl>,
    ProvidesOf<TDecl>
  >;
}

/**
 * Declares a middleware outside any `t`. See the call signatures.
 * @since 0.1.0
 * @stability stable
 */
export const middleware: MiddlewareFactory = /* @__PURE__ */ Object.assign(
  () => (fn: unknown) => fn,
  { effect: () => makeEffectMiddleware },
) as never;

// --- lifecycle helpers (06 (f)) ----------------------------------------------------

/**
 * Runs `fn` before the rest of the chain. `opts.meta` and `opts.input` are
 * typed from the procedure; `opts.ctx` is `unknown` unless given as the
 * first type argument (`onStart<{ user: User }>((opts) => …)`), and a key
 * the procedure's ctx lacks becomes a requirement, as for any middleware.
 * The same goes for {@link onSuccess}, {@link onError} and {@link onFinish}.
 *
 * @example
 * ```ts
 * t.procedure.use(onStart(({ path }) => log.info('start', path)));
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function onStart<TCtx = unknown, TInput = unknown, TMeta = unknown>(
  fn: (opts: MiddlewareOpts<TCtx, TInput, TMeta>) => MaybePromise<void>,
): MiddlewareFunction<TCtx, TInput, TMeta, {}, never> {
  return async (opts) => {
    await fn(opts);
    return opts.next();
  };
}

/**
 * Runs `fn` with the result when the rest of the chain succeeds. For a
 * subscription, that is when the stream is set up.
 *
 * @example
 * ```ts
 * t.procedure.use(onSuccess((data, { path }) => log.info('ok', path)));
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function onSuccess<TCtx = unknown, TInput = unknown, TMeta = unknown>(
  fn: (
    data: unknown,
    opts: MiddlewareOpts<TCtx, TInput, TMeta>,
  ) => MaybePromise<void>,
): MiddlewareFunction<TCtx, TInput, TMeta, {}, never> {
  return async (opts) => {
    const result = await opts.next();
    if (result.ok) await fn(result.data, opts);
    return result;
  };
}

/**
 * Runs `fn` with the error when the rest of the chain fails.
 *
 * @example
 * ```ts
 * t.procedure.use(onError((error, { path }) => report(error, path)));
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function onError<TCtx = unknown, TInput = unknown, TMeta = unknown>(
  fn: (
    error: AnyTrpcError,
    opts: MiddlewareOpts<TCtx, TInput, TMeta>,
  ) => MaybePromise<void>,
): MiddlewareFunction<TCtx, TInput, TMeta, {}, never> {
  return async (opts) => {
    const result = await opts.next();
    if (!result.ok) await fn(result.error, opts);
    return result;
  };
}

/**
 * Runs `fn` with the outcome after the rest of the chain, success or not.
 *
 * @example
 * ```ts
 * t.procedure.use(onFinish((result) => metrics.increment(result.ok ? 'ok' : 'error')));
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function onFinish<TCtx = unknown, TInput = unknown, TMeta = unknown>(
  fn: (
    result:
      | { readonly ok: true; readonly data: unknown }
      | { readonly ok: false; readonly error: AnyTrpcError },
    opts: MiddlewareOpts<TCtx, TInput, TMeta>,
  ) => MaybePromise<void>,
): MiddlewareFunction<TCtx, TInput, TMeta, {}, never> {
  return async (opts) => {
    const result = await opts.next();
    await fn(result, opts);
    return result;
  };
}
