import type { AnyContractRouter } from '../../contract/index.ts';
import type { AnyTrpcError } from '../../internal/error.ts';
import type {
  Merge,
  Missing,
  Overwrite,
  Simplify,
  TypeError,
  Unset,
} from '../../internal/types.ts';
import {
  createBuilder,
  type AnyProcedureBuilder,
  type BuilderDef,
  type ConcatOutputCheck,
  type CurrentCtx,
  type ProcedureBuilder,
  type With,
} from './builder.ts';
import {
  implement,
  type ImplementMetaCheck,
  type ImplementResult,
} from './implement.ts';
import { mergeMeta, type MetaMerge } from './procedure.ts';
import type { Response } from '../execution/index.ts';
import { call, type Call } from '../call.ts';
import {
  lazyWith,
  router,
  type AnyRouter,
  type LazyRouter,
  type Branded,
  type RouterMeta,
  type RouterOptions,
} from './router.ts';
import {
  makeEffectMiddleware,
  type EffectMiddlewareFactory,
  type MiddlewareErrors,
  type MiddlewareFunction,
} from './middleware.ts';

/**
 * The type-level config of `initTrpc`.
 * @since 0.1.0
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
 * @since 0.1.0
 * @stability stable
 */
export interface RootOptions<TMeta> {
  /** Meta every procedure starts with. */
  defaultMeta?: TMeta;
  /**
   * How meta keys merge when `.meta()` sets them again; others are
   * replaced. Extensions set it for their keys, which then merge the same
   * way in every root that adds them.
   *
   * @example
   * ```ts
   * initTrpc<{ meta: { tags?: string[] } }>({
   *   mergeMeta: { tags: (before, next) => [...before, ...next] },
   * });
   * ```
   */
  mergeMeta?: MetaMerge<TMeta>;
  /**
   * Whether a procedure that throws a `TrpcError` it could return logs a
   * warning, once per procedure and code, when `NODE_ENV` is
   * `development`. A thrown error reaches clients untyped.
   * @default true
   */
  warnThrownErrors?: boolean;
}

/**
 * The initial builder state for a root ctx and meta.
 * @since 0.1.0
 * @stability stable
 */
export interface RootDef<TCtx extends object, TMeta extends object> {
  ctx: TCtx;
  needs: {};
  ctxAdded: {};
  meta: TMeta;
  inputIn: Unset;
  inputOut: Unset;
  outputIn: Unset;
  outputOut: Unset;
  outputValidated: never;
  errors: never;
  declared: {};
  shorts: never;
  provided: Response;
  requires: never;
}

/**
 * What `initTrpc()` returns, conventionally named `t`.
 * @since 0.1.0
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
   * Adds a root extension: a procedure builder from a package's
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
   * const t = initTrpc<{ ctx: { ip: string; user: User | null } }>().concat(rateLimit());
   * t.procedure.meta({ rateLimit: { max: 5 } }).mutation(…);
   * ```
   */
  concat<$Ext extends BuilderDef>(
    extension: ProcedureBuilder<$Ext> & RootConcatCheck<TDef, $Ext>,
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
   * Calls one procedure directly, with this root's ctx: a procedure's type
   * leaves the root ctx out. Throws the procedure's `TrpcError`s. A `layer`
   * is built for the call and released once it returns, before a streamed
   * output is read; pass a caller-owned `runtime` for those. A returned
   * response arrives as the web `Response` HTTP would send.
   *
   * @example
   * ```ts
   * const post = await t.call(byId, { id: '1' }, { ctx: { user }, layer: PostRepo.Live });
   * ```
   */
  call: Call<TCtx>;
  /**
   * Implements a contract: a mirror of the contract whose leaves are
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
   * A router whose type carries this root's ctx (`RouterCtx`), which
   * its procedures' types leave out. Handlers type `createContext` from it,
   * so the root router passed to one is made with it, and so is a router
   * in a module of its own: its declarations then name the ctx once.
   * Inline nesting stays plain objects. The router itself is `routes`.
   *
   * @example
   * ```ts
   * // post.ts
   * export const postRouter = t.router({ byId, create });
   * // app.ts
   * export const appRouter = t.router({ post: postRouter, health: { ping } });
   * ```
   */
  router<TRoutes extends AnyRouter>(routes: TRoutes): Branded<TRoutes, TCtx>;
  /**
   * With router-level meta, for the meta keys that have a router-level form
   * ({@link RouterMeta}). Types and RPC paths don't change, and it takes no
   * middleware.
   *
   * @example
   * ```ts
   * const t = initTrpc().concat(experimental_openapi());
   * const appRouter = t.router({
   *   admin: t.router({ meta: { route: { prefix: '/admin', tags: ['admin'] } } }, { users, ban }),
   * });
   * ```
   */
  router<TRoutes extends AnyRouter>(
    opts: RouterOptions<RouterMeta<TDef['meta']>>,
    routes: TRoutes,
  ): Branded<TRoutes, TCtx>;
  /**
   * {@link lazy}, with router-level meta as `t.router()` takes. Under
   * `experimental_openapi()`, a `route.prefix` lets the OpenAPI handler load the subtree
   * on the first request under it instead of at startup.
   *
   * @example
   * ```ts
   * const appRouter = t.router({
   *   admin: t.lazy(() => import('./admin.ts'), { meta: { route: { prefix: '/admin' } } }),
   * });
   * ```
   */
  lazy<TRouter extends AnyRouter>(
    load: () => Promise<TRouter | { default: TRouter }>,
    opts?: RouterOptions<RouterMeta<TDef['meta']>>,
  ): LazyRouter<TRouter>;
}

/**
 * `unknown` when an extension fits a root: the root has the ctx it needs, no
 * meta key with a different type, and no output if the extension has one.
 * @since 0.1.0
 * @stability stable
 */
export type RootConcatCheck<
  TDef extends BuilderDef,
  TExt extends BuilderDef,
> = [Missing<CurrentCtx<TDef>, TExt['ctx']>] extends [never]
  ? [MetaConflicts<TDef['meta'], TExt['meta']>] extends [never]
    ? ConcatOutputCheck<TDef, TExt>
    : TypeError<
        'concat: the extension declares meta keys with other types',
        MetaConflicts<TDef['meta'], TExt['meta']>
      >
  : TypeError<
      'concat: the extension needs ctx this root does not have',
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
 * A root's builder state after `.concat(extension)`.
 * @since 0.1.0
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
    outputIn: TExt['outputIn'] extends Unset
      ? TDef['outputIn']
      : TExt['outputIn'];
    outputOut: TExt['outputOut'] extends Unset
      ? TDef['outputOut']
      : TExt['outputOut'];
    outputValidated: TDef['outputValidated'] | TExt['outputValidated'];
    errors: TDef['errors'] | TExt['errors'];
    declared: Overwrite<TDef['declared'], TExt['declared']>;
    shorts: TDef['shorts'] | TExt['shorts'];
    provided: TDef['provided'] | TExt['provided'];
    requires: TDef['requires'] | Exclude<TExt['requires'], TDef['provided']>;
  }
>;

/**
 * `t.middleware`, with `t.middleware.effect` for Effect middleware.
 * @since 0.1.0
 * @stability stable
 */
export interface RootMiddleware<TCtx extends object, TMeta extends object> {
  <
    $Ctx extends object = {},
    $Err extends MiddlewareErrors = never,
    $Ok = never,
    $Input = Unset,
  >(
    fn: MiddlewareFunction<TCtx, unknown, TMeta, $Ctx, $Err, $Ok, $Input>,
  ): MiddlewareFunction<
    TCtx,
    unknown,
    TMeta,
    $Ctx,
    Extract<$Err, AnyTrpcError>,
    $Ok,
    $Input
  >;
  /**
   * An Effect middleware: `next()` returns an `Effect`. Declare the
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
 * @since 0.1.0
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
      mergeMeta: opts.mergeMeta,
      output: undefined,
      errors: {},
      warnThrown: opts.warnThrownErrors === false ? false : undefined,
    }),
  ) as never;
}

function makeRoot(procedure: AnyProcedureBuilder): TrpcRoot<any, any, any> {
  return {
    procedure,
    concat: (extension: AnyProcedureBuilder) => {
      const ext = extension['~trpc'];
      const own = procedure['~trpc'];
      const merge = { ...ext.mergeMeta, ...own.mergeMeta };
      return makeRoot(
        createBuilder({
          ...own,
          meta: mergeMeta(merge, ext.meta, own.meta),
          mergeMeta: merge,
        }).concat(extension),
      );
    },
    middleware: Object.assign((fn: unknown) => fn, {
      effect: () => makeEffectMiddleware,
    }) as never,
    call: call as never,
    implement: (contract: AnyContractRouter) =>
      implement(procedure['~trpc'], contract) as never,
    router: ((opts: RouterOptions | AnyRouter, routes?: AnyRouter) =>
      routes === undefined
        ? opts
        : router(opts as RouterOptions, routes)) as never,
    lazy: (load: () => Promise<never>, opts: RouterOptions = {}) =>
      lazyWith(load, opts),
  };
}
