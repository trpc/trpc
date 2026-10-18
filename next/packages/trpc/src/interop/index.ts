/**
 * Serve a v12 router to old clients while they update, and run v11 links
 * in a v12 client with `fromV11Link`.
 *
 * @example
 * ```ts
 * import superjson from 'superjson';
 * import { createV11Handler } from '@trpc12/trpc/interop';
 *
 * // @trpc/client 11 apps keep calling /trpc
 * const legacy = createV11Handler({ router: appRouter, createContext, transformer: superjson });
 * ```
 * @module
 */
export {
  createV11Handler,
  type BaseV11HandlerOptions,
  type V11Handler,
  type V11HandlerOptions,
  type V11Transformer,
  type V11TransformerOption,
  type V11ErrorFormatterOpts,
  type V11ErrorShape,
} from './handler/index.ts';
export {
  fromV11Link,
  type V11Link,
  type V11Observable,
  type V11Operation,
  type V11ResultEnvelope,
} from './link.ts';
