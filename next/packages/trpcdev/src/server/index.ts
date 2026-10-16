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
// Loads the entry point declaration emit names builder internals through.
import type {} from 'trpcdev/internal';

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
  DeclaredErrors,
  ErrorConstructorOpts,
  ErrorConstructors,
  ErrorMapInput,
  InputOpts,
  ProcedureBuilder,
  ProvideOpts,
  ResolverOpts,
  SubscriptionResolverOpts,
} from './builder.ts';
export type {
  ImplementedRouter,
  Implementer,
  ImplementRouter,
  ImplementResult,
  ProcedureImplementer,
} from './implement.ts';
export {
  middleware,
  ok,
  type EffectMiddleware,
  type EffectMiddlewareDecl,
  type EffectMiddlewareOpts,
  type EffectNextFn,
  type MiddlewareFunction,
  type MiddlewareOpts,
  type MiddlewareRequirements,
  type MiddlewareResult,
  type NextFn,
  type NextInput,
  type OkResult,
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
} from './procedure.ts';
export {
  isLazy,
  lazy,
  loadRouter,
  mergeRouters,
  router,
  type AnyLazyRouter,
  type AnyRouter,
  type LazyOptions,
  type LazyRouter,
  type RouterGroup,
  type Unlazy,
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
export {
  stream,
  type OutputSchema,
  type StreamOutput,
  type StreamSchema,
} from './stream-schema.ts';
export { tracked, type TrackedEnvelope } from './tracked.ts';
export {
  makeMemoryPublisher,
  Publisher,
  type MemoryPublisherOptions,
  type PublisherClass,
  type PublisherEvents,
  type PublisherShape,
} from './publisher.ts';
export {
  createFetchHandler,
  type BaseHandlerOptions,
  type ContextOption,
  type CreateContextOpts,
  type LayerOption,
  type FetchHandler,
  type FetchHandlerOptions,
  type OnErrorOpts,
  type PlatformArgs,
  type PlatformField,
} from './fetch.ts';
export type { MessagePortLike, Transport, WebSocketLike } from './socket.ts';
export {
  createHibernatingWebSockets,
  type HibernatableWebSocket,
  type HibernatingWebSockets,
  type HibernatingWebSocketsOptions,
  type HibernationState,
} from './hibernation.ts';
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
  type TaggedData,
  type TaggedErrorClass,
  type TaggedErrorOptions,
  type TaggedErrorSpec,
  type BuiltinErrorCode,
  type TrpcErrorOptions,
} from '../internal/error.ts';
export type { ProcedureType, TypeError } from '../internal/types.ts';
