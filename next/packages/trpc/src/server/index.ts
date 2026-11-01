/**
 * Define procedures and routers, and serve them.
 *
 * @example
 * ```ts
 * import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
 * import { z } from 'zod';
 *
 * const t = initTrpc<{ ctx: { user: User | null } }>();
 *
 * export const appRouter = t.router({
 *   post: {
 *     byId: t.procedure
 *       .input(z.object({ id: z.string() }))
 *       .query(async ({ input }) =>
 *         (await db.post.find(input.id)) ?? error({ code: 'NOT_FOUND' }),
 *       ),
 *   },
 * });
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
import type {} from '@trpc12/trpc/internal';

export {
  initTrpc,
  type ExtendedDef,
  type RootConfig,
  type RootDef,
  type RootMiddleware,
  type RootOptions,
  type TrpcRoot,
  type AnyProcedureBuilder,
  type DeclaredErrors,
  type ErrorConstructorOpts,
  type ErrorConstructors,
  type ErrorMapInput,
  type InputOpts,
  type ProcedureBuilder,
  type ProvideOpts,
  type ResolverOpts,
  type SubscriptionResolverOpts,
  type ImplementedRouter,
  type Implementer,
  type ImplementerRoot,
  type ImplementRouter,
  type ImplementResult,
  type ProcedureImplementer,
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
  type NextError,
  type NextFn,
  type NextInput,
  type NextResult,
  type OkResult,
  type ResponseHandle,
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
  type QueryProcedure,
  type MutationProcedure,
  type SubscriptionProcedure,
  type MetaMerge,
  isLazy,
  lazy,
  loadRouter,
  mergeRouters,
  router,
  type AnyLazyRouter,
  type AnyRouter,
  type Branded,
  type LazyRouter,
  type MergedRouter,
  type RootRouterCheck,
  type RouterCtx,
  type RouterMeta,
  type RouterOptions,
  type Unlazy,
  type inferRouterContext,
  type inferRouterErrors,
  type inferRouterInputs,
  type inferRouterOutputs,
  type inferRouterServices,
} from './procedures/index.ts';
export { Response, type ResponseService } from './execution/index.ts';
export {
  type AnySchema,
  type EffectInputIssue,
  type inferInputIssue,
  type InputIssue,
  type InputValidationError,
  type InputValidationErrorData,
  type IssuePath,
  type SchemaInputErrorData,
  type SchemaValidationError,
  type StandardIssue,
  type StandardSchemaV1,
  type ZodInputIssue,
  type ZodInputIssues,
  stream,
  experimental_byteStream,
  type experimental_ByteStream,
  type experimental_ByteStreamError,
  type experimental_ByteStreamOptions,
  type experimental_ByteStreamSchema,
  type OutputSchema,
  type StreamOutput,
  type StreamSchema,
} from './validation/index.ts';
export {
  tracked,
  type TrackedEnvelope,
  experimental_makeMemoryPublisher,
  experimental_Publisher,
  type MemoryPublisherOptions,
  type PublisherClass,
  type PublisherEvents,
  type PublisherShape,
  type SubscribeOptions,
} from './subscriptions/index.ts';
export {
  createFetchHandler,
  makeFetchHandler,
  type BaseHandlerOptions,
  type ContextOption,
  type CreateContextOpts,
  type LayerOption,
  type TransformerOption,
  type FetchHandler,
  type FetchHandlerOptions,
  type MakeFetchHandlerOptions,
  type OnErrorOpts,
  type PlatformArgs,
  type PlatformField,
  type RuntimeOption,
} from './handler/index.ts';
export type {
  MessagePortLike,
  Transport,
  WebSocketLike,
} from './sockets/index.ts';
export { createRouterClient, type RouterClientOptions } from './caller.ts';
export type { Call, CallOptions, CallOutput } from './call.ts';
export {
  ERROR_STATUS,
  error,
  hasCode,
  isDefinedError,
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
  type TaggedData,
  type TaggedErrorClass,
  type TaggedErrorOptions,
  type TaggedErrorSpec,
  type BuiltinErrorClass,
  type BuiltinErrorCode,
  type BuiltinErrorOptions,
  type BuiltinTag,
  type ClientTags,
  type CodeTags,
  type Failure,
  type FailureTags,
  type TagOfCode,
  type UndeclaredCode,
  type TrpcErrorOptions,
} from '../internal/error.ts';
export type { ProcedureType } from '../internal/types.ts';
