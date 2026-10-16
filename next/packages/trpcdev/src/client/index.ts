/**
 * The tRPC client: a typed proxy over a chain of links.
 *
 * @example
 * ```ts
 * import { createTrpcClient, httpLink, safe } from 'trpcdev/client';
 * import type { AppRouter } from './server';
 *
 * const client = createTrpcClient<AppRouter>({
 *   links: [httpLink({ url: 'http://localhost:3000/trpc' })],
 * });
 * const [post, error] = await safe(client.post.byId.query({ id: '1' }));
 * ```
 * @module
 */
// Loads the entry point declaration emit names builder internals through.
import type {} from 'trpcdev/internal';

export {
  createSafeClient,
  createTrpcClient,
  getClientSerializer,
  safe,
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
  type PromiseLinkOpts,
  type TrpcClientContext,
  type TrpcRequestInit,
  type TrpcLink,
} from './link.ts';
export {
  dedupeLink,
  durableLink,
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
} from './links/basic.ts';
export { httpLink, type HttpLinkOptions } from './links/http.ts';
export {
  switchLink,
  type ReservedSwitchName,
  type SwitchLinkDecl,
  type SwitchLinkOptions,
} from './links/switch.ts';
export { localLink, type LocalLinkOptions } from './links/local.ts';
export {
  validationLink,
  type ValidationLinkOptions,
} from './links/validation.ts';
export {
  messagePortLink,
  wsLink,
  type MessagePortLinkOptions,
  type SocketLink,
  type SocketLinkOptions,
  type WebSocketLinkOptions,
} from './links/socket.ts';
export {
  routerType,
  type CallOptions,
  type ClientError,
  type DecorateProcedure,
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
  type UnexpectedError,
} from './types.ts';
export type { MessagePortLike } from '../server/socket.ts';
export {
  ERROR_STATUS,
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
export type { Deserialized } from '../internal/types.ts';
