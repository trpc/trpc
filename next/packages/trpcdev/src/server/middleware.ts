import type { Effect } from 'effect';
import type { AnyTrpcError } from '../internal/error.ts';
import type {
  MaybePromise,
  ProcedureType,
  TypeError,
  Unset,
} from '../internal/types.ts';

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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type MiddlewareResult<TCtx, TInput = Unset> = (
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly error: AnyTrpcError }
) & { readonly '~ctx'?: TCtx; readonly '~input'?: TInput };

/**
 * The input after a middleware: the one it passed to `next({ input })`, or
 * the current one.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type NextInput<TCurrent, $Input> = [$Input] extends [Unset]
  ? TCurrent
  : $Input;

/**
 * A short-circuit result from {@link ok}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface OkResult<T> {
  readonly ok: true;
  /** Typed through `'~short'`, so that `next()` results don't infer as shorts. */
  readonly data: unknown;
  readonly '~ok': true;
  readonly '~short'?: T;
}

/**
 * Ends the chain with `data` instead of calling `next()` (06 Q6.2). The
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function ok<const T>(data: T): OkResult<T> {
  return { ok: true, data, '~ok': true };
}

/**
 * Calls the rest of the chain, optionally extending `ctx` or replacing the
 * input. A replaced input is what later steps and the resolver get, typed as
 * passed.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type MiddlewareFunction<
  TCtx,
  TInput,
  TMeta,
  $Ctx extends object,
  $Err extends AnyTrpcError,
  $Ok = never,
  $Input = Unset,
> = (
  opts: MiddlewareOpts<TCtx, TInput, TMeta>,
) => MaybePromise<MiddlewareResult<$Ctx, $Input> | $Err | OkResult<$Ok>>;

/**
 * What a standalone middleware needs from the procedure it is used on.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * `next()` for Effect middleware. It requires the services the middleware
 * declares in `provides`, so a body that forgets to provide them is a type
 * error.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface EffectNextFn<TProvides> {
  (): Effect.Effect<MiddlewareResult<{}>, never, TProvides>;
  <$Ctx extends object>(opts: {
    ctx: $Ctx;
  }): Effect.Effect<MiddlewareResult<$Ctx>, never, TProvides>;
  <$Input, $Ctx extends object = {}>(opts: {
    ctx?: $Ctx;
    input: $Input;
  }): Effect.Effect<MiddlewareResult<$Ctx, $Input>, never, TProvides>;
}

/**
 * The options an Effect middleware receives.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * A middleware whose body is an `Effect`. Its failures join the error union,
 * its requirements join the procedure's services, and the services it
 * `provides` are removed from what later steps require.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
  ) => Effect.Effect<MiddlewareResult<$Ctx, $Input> | OkResult<$Ok>, $Err, $R>;
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface EffectMiddlewareDecl extends MiddlewareRequirements {
  /** Services the middleware provides to everything after it. */
  provides?: unknown;
}

type ProvidesOf<T extends EffectMiddlewareDecl> = 'provides' extends keyof T
  ? T['provides']
  : never;

/** @internal */
export type EffectMiddlewareFactory<TCtx, TInput, TMeta, $Provides> = <
  $Ctx extends object = {},
  $E = never,
  $R = never,
  $Ok = never,
  $Input = Unset,
>(
  fn: (
    opts: EffectMiddlewareOpts<TCtx, TInput, TMeta, $Provides>,
  ) => Effect.Effect<MiddlewareResult<$Ctx, $Input> | OkResult<$Ok>, $E, $R> &
    EffectBodyCheck<$E, $R, $Provides>,
) => EffectMiddleware<
  TCtx,
  TInput,
  TMeta,
  $Ctx,
  Extract<$E, AnyTrpcError>,
  Exclude<$R, $Provides>,
  $Provides,
  $Ok,
  $Input
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
    $Err extends AnyTrpcError = never,
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
    $Err,
    $Ok,
    $Input
  >;
  /**
   * A standalone Effect middleware (06 M-A). Declare the services it
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const middleware: MiddlewareFactory = Object.assign(
  () => (fn: unknown) => fn,
  { effect: () => makeEffectMiddleware },
) as never;

// --- lifecycle helpers (06 (f)) ----------------------------------------------------

type AnyOpts = MiddlewareOpts<unknown, unknown, unknown>;

/**
 * Runs `fn` before the rest of the chain.
 *
 * @example
 * ```ts
 * t.procedure.use(onStart(({ path }) => log.info('start', path)));
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function onStart(
  fn: (opts: AnyOpts) => MaybePromise<void>,
): MiddlewareFunction<unknown, unknown, unknown, {}, never> {
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function onSuccess(
  fn: (data: unknown, opts: AnyOpts) => MaybePromise<void>,
): MiddlewareFunction<unknown, unknown, unknown, {}, never> {
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function onError(
  fn: (error: AnyTrpcError, opts: AnyOpts) => MaybePromise<void>,
): MiddlewareFunction<unknown, unknown, unknown, {}, never> {
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function onFinish(
  fn: (
    result:
      | { readonly ok: true; readonly data: unknown }
      | { readonly ok: false; readonly error: AnyTrpcError },
    opts: AnyOpts,
  ) => MaybePromise<void>,
): MiddlewareFunction<unknown, unknown, unknown, {}, never> {
  return async (opts) => {
    const result = await opts.next();
    await fn(result, opts);
    return result;
  };
}
