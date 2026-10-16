import type { AnyContractRouter } from '../contract/index.ts';
import type { AnyTrpcError } from '../internal/error.ts';
import type {
  Merge,
  Missing,
  Overwrite,
  Simplify,
  TypeError,
  Unset,
} from '../internal/types.ts';
import {
  createBuilder,
  type AnyProcedureBuilder,
  type BuilderDef,
  type CurrentCtx,
  type ProcedureBuilder,
  type With,
} from './builder.ts';
import {
  implement,
  type ImplementMetaCheck,
  type ImplementResult,
} from './implement.ts';
import type { Response } from './response.ts';
import { router } from './router.ts';
import {
  makeEffectMiddleware,
  type EffectMiddlewareFactory,
  type MiddlewareFunction,
} from './middleware.ts';

/**
 * The type-level config of `initTrpc`.
 * @since 12.0.0-alpha.0
 * @stability stable
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
 * @stability stable
 */
export interface RootOptions<TMeta> {
  /** Meta every procedure starts with. */
  defaultMeta?: TMeta;
}

/**
 * The initial builder state for a root ctx and meta.
 * @since 12.0.0-alpha.0
 * @stability stable
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
  provided: Response;
  requires: never;
}

/**
 * What `initTrpc()` returns, conventionally named `t`.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface TrpcRoot<
  TCtx extends object,
  TMeta extends object,
  TDef extends BuilderDef = RootDef<TCtx, TMeta>,
> {
  /** The base procedure builder. */
  procedure: ProcedureBuilder<TDef>;
  /**
   * Adds a root extension (03 Q3.6): a procedure builder from a package's
   * own `initTrpc`, whose middleware, declared errors and provided services
   * every procedure then starts with. Its root ctx is what it needs from
   * yours; its meta type joins yours, with its default meta underneath.
   * Extensions chain.
   *
   * @example
   * ```ts
   * // in a package
   * interface RateLimitMeta { rateLimit?: { max: number } }
   * const r = initTrpc<{ ctx: { ip: string }; meta: RateLimitMeta }>({
   *   defaultMeta: { rateLimit: { max: 100 } },
   * });
   * export const rateLimit = () =>
   *   r.procedure
   *     .errors({ TOO_MANY_REQUESTS: { status: 429 } })
   *     .use(({ ctx, meta, errors, next }) =>
   *       limiter.allow(ctx.ip, meta.rateLimit) ? next() : errors.TOO_MANY_REQUESTS(),
   *     );
   *
   * // in the app
   * const t = initTrpc<{ ctx: { ip: string; user: User | null } }>().with(rateLimit());
   * t.procedure.meta({ rateLimit: { max: 5 } }).mutation(…);
   * ```
   */
  with<$Ext extends BuilderDef>(
    extension: ProcedureBuilder<$Ext> & WithCheck<TDef, $Ext>,
  ): TrpcRoot<TCtx, Simplify<TMeta & $Ext['meta']>, ExtendedDef<TDef, $Ext>>;
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
  middleware: RootMiddleware<CurrentCtx<TDef>, TDef['meta']>;
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
    contract: TContract & ImplementMetaCheck<TDef['meta'], TContract>,
  ): ImplementResult<TDef, TContract>;
  /**
   * Groups routes for OpenAPI: a path prefix and tags (08 Q8.3). Types and
   * RPC paths don't change, and it takes no middleware.
   *
   * @example
   * ```ts
   * const appRouter = {
   *   admin: t.router({ prefix: '/admin', tags: ['admin'] }, { users, ban }),
   * };
   * ```
   */
  router: typeof router;
}

/**
 * `unknown` when an extension fits a root: the root has the ctx it needs and
 * no meta key with a different type.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export type WithCheck<TDef extends BuilderDef, TExt extends BuilderDef> = [
  Missing<CurrentCtx<TDef>, TExt['ctx']>,
] extends [never]
  ? [MetaConflicts<TDef['meta'], TExt['meta']>] extends [never]
    ? unknown
    : TypeError<
        'with: the extension declares meta keys with other types',
        MetaConflicts<TDef['meta'], TExt['meta']>
      >
  : TypeError<
      'with: the extension needs ctx this root does not have',
      Missing<CurrentCtx<TDef>, TExt['ctx']>
    >;

type MetaConflicts<A, B> = {
  [K in keyof A & keyof B]: [A[K]] extends [B[K]]
    ? [B[K]] extends [A[K]]
      ? never
      : K
    : K;
}[keyof A & keyof B];

/**
 * A root's builder state after `.with(extension)`.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export type ExtendedDef<
  TDef extends BuilderDef,
  TExt extends BuilderDef,
> = With<
  TDef,
  {
    meta: Simplify<TDef['meta'] & TExt['meta']>;
    ctxAdded: Overwrite<TDef['ctxAdded'], TExt['ctxAdded']>;
    inputIn: Merge<TDef['inputIn'], TExt['inputIn']>;
    inputOut: Merge<TDef['inputOut'], TExt['inputOut']>;
    errors: TDef['errors'] | TExt['errors'];
    declared: Overwrite<TDef['declared'], TExt['declared']>;
    shorts: TDef['shorts'] | TExt['shorts'];
    provided: TDef['provided'] | TExt['provided'];
    requires: TDef['requires'] | Exclude<TExt['requires'], TDef['provided']>;
  }
>;

/**
 * `t.middleware`, with `t.middleware.effect` for Effect middleware.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface RootMiddleware<TCtx extends object, TMeta extends object> {
  <
    $Ctx extends object = {},
    $Err extends AnyTrpcError = never,
    $Ok = never,
    $Input = Unset,
  >(
    fn: MiddlewareFunction<TCtx, unknown, TMeta, $Ctx, $Err, $Ok, $Input>,
  ): MiddlewareFunction<TCtx, unknown, TMeta, $Ctx, $Err, $Ok, $Input>;
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
 * @stability stable
 */
export function initTrpc<TConfig extends RootConfig = {}>(
  opts: RootOptions<TConfig['meta'] extends object ? TConfig['meta'] : {}> = {},
): TrpcRoot<
  TConfig['ctx'] extends object ? TConfig['ctx'] : {},
  TConfig['meta'] extends object ? TConfig['meta'] : {}
> {
  return makeRoot(
    createBuilder({
      steps: [],
      meta: opts.defaultMeta ?? {},
      output: undefined,
      errors: {},
      route: undefined,
    }),
  ) as never;
}

function makeRoot(procedure: AnyProcedureBuilder): TrpcRoot<any, any, any> {
  return {
    procedure,
    with: (extension: AnyProcedureBuilder) => {
      const ext = extension['~trpc'];
      const own = procedure['~trpc'];
      return makeRoot(
        createBuilder({
          ...own,
          meta: { ...ext.meta, ...own.meta },
        }).concat(extension),
      );
    },
    middleware: Object.assign((fn: unknown) => fn, {
      effect: () => makeEffectMiddleware,
    }) as never,
    implement: (contract: AnyContractRouter) =>
      implement(procedure['~trpc'], contract) as never,
    router,
  };
}
