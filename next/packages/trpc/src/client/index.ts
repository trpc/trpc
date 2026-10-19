/**
 * The tRPC client: a typed proxy over a chain of links.
 *
 * @example
 * ```ts
 * import { createTrpcClient, httpLink, routerType, safe } from '@trpc12/trpc/client';
 * import type { AppRouter } from './server';
 *
 * const client = createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [httpLink({ url: 'http://localhost:3000/trpc' })],
 * });
 * const [post, error] = await safe(client.post.byId.query({ id: '1' }));
 * ```
 * @module
 */
// Loads the entry point declaration emit names builder internals through.
import type {} from '@trpc12/trpc/internal';

export {
  createSafeClient,
  createTrpcClient,
  getClientSerializer,
  matchError,
  safe,
  type ErrorHandlers,
  type SafeClient,
  type SafeResult,
  type TrpcClientOptions,
  type TypedClientOptions,
} from './client.ts';
export {
  link,
  type AnyLink,
  type EffectLinkOpts,
  type LinkDecl,
  type ReservedCallOptions,
  type Operation,
  type OperationStream,
  type BuiltinCallOptions,
  type ResponseMeta,
  type TrpcRequestInit,
  type TrpcLink,
} from './link.ts';
export {
  dedupeLink,
  experimental_durableLink,
  loggerLink,
  retryLink,
  splitLink,
  type DedupeContext,
  type DedupeLinkOptions,
  type DurableContext,
  type DurableLinkOptions,
  type LoggerEvent,
  type RetryLinkOptions,
  type SplitLinkOptions,
  httpLink,
  type HttpLinkOptions,
  experimental_httpStreams,
  type HttpStreams,
  type HttpStreamsOptions,
  switchLink,
  type ReservedSwitchName,
  type SwitchLinkDecl,
  type SwitchLinkOptions,
  localLink,
  type LocalLinkOptions,
  experimental_validationLink,
  type ValidationLinkOptions,
  experimental_messagePortLink,
  experimental_socketLink,
  wsLink,
  type ConnectionLinkOptions,
  type MessagePortLinkOptions,
  type RawSocketLinkOptions,
  type SocketLink,
  type SocketLinkOptions,
  type WebSocketLinkOptions,
} from './links/index.ts';
export {
  routerType,
  type BuiltinError,
  type CallOptions,
  type ClientError,
  type ClientTypes,
  type DecorateProcedure,
  type LinkErrorCode,
  type DefinedError,
  type ErrorData,
  type ChainTypes,
  type LinksContext,
  type LinksTypes,
  type RouterOf,
  type RouterPaths,
  type RouterType,
  type SubscribeOptions,
  type TrpcClient,
  type TrpcPromise,
  type TrpcSubscription,
} from './types.ts';
export type { MessagePortLike } from '../server/sockets/index.ts';
export {
  ERROR_CATEGORY,
  ERROR_STATUS,
  isBuiltinCode,
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
  type CategoryCode,
  type ErrorCategory,
  type TrpcErrorOptions,
} from '../internal/error.ts';
export type { Deserialized } from '../internal/types.ts';
