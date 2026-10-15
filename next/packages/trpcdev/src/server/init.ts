import type { AnyContractRouter } from '../contract/index.ts';
import type { AnyTrpcError } from '../internal/error.ts';
import type { Unset } from '../internal/types.ts';
import { createBuilder, type ProcedureBuilder } from './builder.ts';
import { implement, type ImplementResult } from './implement.ts';
import {
  makeEffectMiddleware,
  type EffectMiddlewareFactory,
  type MiddlewareFunction,
} from './middleware.ts';

/**
 * The type-level config of `initTrpc`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface RootConfig {
  /** What `createContext` returns. */
  ctx?: object;
  /** The shape of procedure meta. */
  meta?: object;
}

/**
 * The runtime options of `initTrpc`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface RootOptions<TMeta> {
  /** Meta every procedure starts with. */
  defaultMeta?: TMeta;
}

/**
 * The initial builder state for a root ctx and meta.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface RootDef<TCtx extends object, TMeta extends object> {
  ctx: TCtx;
  ctxAdded: {};
  meta: TMeta;
  inputIn: Unset;
  inputOut: Unset;
  outputIn: Unset;
  outputOut: Unset;
  errors: never;
  declared: {};
  shorts: never;
  provided: never;
  requires: never;
}

/**
 * What `initTrpc()` returns, conventionally named `t`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcRoot<TCtx extends object, TMeta extends object> {
  /** The base procedure builder. */
  procedure: ProcedureBuilder<RootDef<TCtx, TMeta>>;
  /**
   * Types a middleware against this root, for reuse across procedures.
   *
   * @example
   * ```ts
   * const timed = t.middleware(async ({ path, next }) => {
   *   const start = Date.now();
   *   const result = await next();
   *   log(path, Date.now() - start);
   *   return result;
   * });
   * ```
   */
  middleware: RootMiddleware<TCtx, TMeta>;
  /**
   * Implements a contract (09): a mirror of the contract whose leaves are
   * builders pre-loaded with the contract's input, output, errors and route.
   * Leaves only offer `.use()`, `.provide()` and the contract's terminal, and
   * may only return errors the contract declares. `impl.router()` checks
   * completeness.
   *
   * @example
   * ```ts
   * const impl = t.implement(appContract);
   * export const appRouter = impl.router({
   *   post: {
   *     byId: impl.post.byId.use(authed).query(async ({ input, errors }) =>
   *       (await db.post.find(input.id)) ?? errors.NOT_FOUND({ data: { id: input.id } }),
   *     ),
   *     create: impl.post.create.mutation(({ input }) => db.post.create(input)),
   *   },
   * });
   * ```
   */
  implement<TContract extends AnyContractRouter>(
    contract: TContract,
  ): ImplementResult<RootDef<TCtx, TMeta>, TContract>;
}

/**
 * `t.middleware`, with `t.middleware.effect` for Effect middleware.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface RootMiddleware<TCtx extends object, TMeta extends object> {
  <$Ctx extends object = {}, $Err extends AnyTrpcError = never, $Ok = never>(
    fn: MiddlewareFunction<TCtx, unknown, TMeta, $Ctx, $Err, $Ok>,
  ): MiddlewareFunction<TCtx, unknown, TMeta, $Ctx, $Err, $Ok>;
  /**
   * An Effect middleware (06 M-A): `next()` returns an `Effect`. Declare the
   * services it provides with `t.middleware.effect<{ provides: S }>()(fn)`.
   *
   * @example
   * ```ts
   * const timed = t.middleware.effect()(({ path, next }) =>
   *   next().pipe(Effect.withSpan(path)),
   * );
   * const withUser = t.middleware.effect<{ provides: CurrentUser }>()(({ ctx, next }) =>
   *   next().pipe(Effect.provideService(CurrentUser, ctx.user)),
   * );
   * ```
   */
  effect<TDecl extends { provides?: unknown } = {}>(): EffectMiddlewareFactory<
    TCtx,
    unknown,
    TMeta,
    'provides' extends keyof TDecl ? TDecl['provides'] : never
  >;
}

/**
 * Creates the root object for a ctx and meta type: one option bag, no
 * `.create()`.
 *
 * @example
 * ```ts
 * interface Context { user: User | null }
 * interface Meta { auth?: 'admin' }
 *
 * const t = initTrpc<{ ctx: Context; meta: Meta }>();
 * export const publicProcedure = t.procedure;
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function initTrpc<TConfig extends RootConfig = {}>(
  opts: RootOptions<TConfig['meta'] extends object ? TConfig['meta'] : {}> = {},
): TrpcRoot<
  TConfig['ctx'] extends object ? TConfig['ctx'] : {},
  TConfig['meta'] extends object ? TConfig['meta'] : {}
> {
  const procedure = createBuilder({
    steps: [],
    meta: opts.defaultMeta ?? {},
    output: undefined,
    errors: {},
    route: undefined,
  });
  return {
    procedure,
    middleware: Object.assign((fn: unknown) => fn, {
      effect: () => makeEffectMiddleware,
    }) as never,
    implement: (contract: AnyContractRouter) =>
      implement(procedure['~trpc'], contract) as never,
  };
}
