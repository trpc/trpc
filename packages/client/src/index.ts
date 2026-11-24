// TODO: Be explicit about what we export here

export * from './createTRPCUntypedClient';
export * from './createTRPCClient';
export * from './getFetch';
export * from './TRPCClientError';
export * from './links';

export {
  /**
   * @deprecated - use `createTRPCClient` instead
   */
  createTRPCClient as createTRPCProxyClient,
  /**
   * @deprecated - use `inferRouterClient` instead
   */
  type inferRouterClient as inferRouterProxyClient,
} from './createTRPCClient';

export {
  experimental_query,
  experimental_infiniteQuery,
  experimental_dataOf,
  experimental_perItem,
  type experimental_DataEntry,
  type experimental_DataOfEntry,
  type experimental_FromDataEntry,
  type experimental_InfiniteData,
  type experimental_InfiniteQueryEntry,
  type experimental_InfiniteQueryEntryOptions,
  type experimental_ItemEntries,
  type experimental_PerItemEntry,
  type experimental_QueryEntry,
  type experimental_QueryEntryOptions,
  type experimental_QueryProcedure,
  type experimental_QueryProcedures,
} from './queries/entry';
export {
  experimental_load,
  experimental_settle,
  type experimental_LoadEntries,
  type experimental_Loaded,
  type experimental_LoadedList,
  type experimental_Settled,
} from './queries/load';

export { type TRPCProcedureOptions } from './internals/types';

export {
  safe,
  type SafeResult,
  type TRPCTaggedPromise as TRPCPromise,
} from './safe';
