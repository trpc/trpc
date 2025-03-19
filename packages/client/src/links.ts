export * from './links/types';

export { type HTTPBatchLinkOptions } from './links/HTTPBatchLinkOptions';
export { httpBatchLink } from './links/httpBatchLink';
export {
  httpBatchStreamLink,
  /**
   * @deprecated use {@link httpBatchStreamLink} instead
   */
  httpBatchStreamLink as unstable_httpBatchStreamLink,
} from './links/httpBatchStreamLink';
export { httpLink } from './links/httpLink';
export { loggerLink, LoggerLinkOptions } from './links/loggerLink';
export { splitLink } from './links/splitLink';
export { wsLink } from './links/wsLink/wsLink';
export {
  httpSubscriptionLink,
  /**
   * @deprecated use {@link httpSubscriptionLink} instead
   */
  httpSubscriptionLink as unstable_httpSubscriptionLink,
} from './links/httpSubscriptionLink';
export { retryLink } from './links/retryLink';

// These are not public (yet) as we get this functionality from tanstack query
// export * from './links/internals/dedupeLink';
