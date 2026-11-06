export type { TRPCLoaderOptionsProxy } from './internals/createOptionsProxy';
export {
  loadHandles,
  prefetchEntry,
  fetchEntry,
  ensureEntry,
  prefetchInfiniteEntry,
  fetchInfiniteEntry,
  ensureInfiniteEntry,
  waterfallHandle,
  waterfallInfiniteHandle,
  fromHandle,
  isTRPCEntryError,
  TRPCEntryError,
} from './internals/handles';
export type {
  TRPCQueryHandle,
  TRPCInfiniteQueryHandle,
  AnyTRPCHandle,
  TRPCQueryEntry,
  TRPCInfiniteQueryEntry,
  AnyTRPCEntry,
  TRPCEntryKind,
  TRPCLoadedHandles,
  TRPCEntryOptions,
  TRPCInfiniteEntryOptions,
  inferQueryHandle,
  inferInfiniteQueryHandle,
} from './internals/handles';
