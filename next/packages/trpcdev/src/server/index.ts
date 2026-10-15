/**
 * Define procedures and routers, and serve them.
 *
 * @example
 * ```ts
 * import { createFetchHandler, error, initTrpc } from 'trpcdev/server';
 * import { z } from 'zod';
 *
 * const t = initTrpc<{ ctx: { user: User | null } }>();
 *
 * export const appRouter = {
 *   post: {
 *     byId: t.procedure
 *       .input(z.object({ id: z.string() }))
 *       .query(async ({ input }) =>
 *         (await db.post.find(input.id)) ?? error({ code: 'NOT_FOUND' }),
 *       ),
 *   },
 * };
 * export type AppRouter = typeof appRouter;
 *
 * export default createFetchHandler({
 *   router: appRouter,
 *   createContext: ({ request }) => ({ user: getUser(request) }),
 * });
 * ```
 * @module
 */
export {
  initTrpc,
  type RootConfig,
  type RootDef,
  type RootMiddleware,
  type RootOptions,
  type TrpcRoot,
} from './init.ts';
export type {
  AnyProcedureBuilder,
  BuilderDef,
  BuilderInternals,
  BuildProcedure,
  ConcatCheck,
  CurrentCtx,
  DeclaredErrors,
  ErrorConstructorOpts,
  ErrorConstructors,
  ErrorMapInput,
  InputDef,
  InputOpts,
  ProcedureBuilder,
  ProvideOpts,
  ResolverOpts,
  ShortsCheck,
  Split,
  SplitReturn,
  SplitStream,
  StrictErrors,
  SubscriptionResolverOpts,
  With,
} from './builder.ts';
export type {
  ExactRouter,
  ImplementedProcedure,
  ImplementedRouter,
  Implementer,
  ImplementerDef,
  ImplementerMethods,
  ImplementRouter,
  ImplementResult,
  ProcedureImplementer,
  UndeclaredCheck,
} from './implement.ts';
export {
  middleware,
  ok,
  onError,
  onFinish,
  onStart,
  onSuccess,
  type EffectBodyCheck,
  type EffectMiddleware,
  type EffectMiddlewareDecl,
  type EffectMiddlewareFactory,
  type EffectMiddlewareOpts,
  type EffectNextFn,
  type MiddlewareFunction,
  type MiddlewareOpts,
  type MiddlewareRequirements,
  type MiddlewareResult,
  type NextFn,
  type OkResult,
  type ReqCtx,
  type ReqInput,
  type ReqMeta,
  type ResponseHandle,
} from './middleware.ts';
export {
  isProcedure,
  type AnyProcedure,
  type ErrorMap,
  type ErrorSpec,
  type inferProcedureErrors,
  type inferProcedureInput,
  type inferProcedureOutput,
  type Procedure,
  type ProcedureDef,
  type ProcedureInternals,
  type Route,
  type Step,
} from './procedure.ts';
export {
  mergeRouters,
  type AnyRouter,
  type inferRouterContext,
  type inferRouterErrors,
  type inferRouterInputs,
  type inferRouterOutputs,
  type inferRouterServices,
} from './router.ts';
export type {
  AnySchema,
  InputValidationError,
  InputValidationErrorData,
  StandardIssue,
  StandardSchemaV1,
} from './schema.ts';
export { tracked, type TrackedEnvelope } from './tracked.ts';
export {
  createFetchHandler,
  type BaseHandlerOptions,
  type ContextOption,
  type CreateContextOpts,
  type LayerOption,
  type FetchHandler,
  type FetchHandlerOptions,
  type OnErrorOpts,
} from './fetch.ts';
export type { MessagePortLike, Transport, WebSocketLike } from './socket.ts';
export {
  call,
  createRouterClient,
  type CallOptions,
  type RouterClientOptions,
} from './caller.ts';
export {
  ERROR_STATUS,
  error,
  isDefinedError,
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
  type BuiltinErrorCode,
  type TrpcErrorOptions,
} from '../internal/error.ts';
export type { ProcedureType, TypeError, Unset } from '../internal/types.ts';
