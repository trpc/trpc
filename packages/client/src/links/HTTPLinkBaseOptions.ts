import type {
  AnyClientTypes,
  PathSeparator,
} from '@trpc/server/unstable-core-do-not-import';
import type { FetchEsque } from '../types';
import type { TransformerOptions } from '../unstable-internals';

/**
 * The options every HTTP link takes.
 * @internal
 */
export type HTTPLinkBaseOptions<
  TRoot extends Pick<AnyClientTypes, 'transformer'>,
> = {
  /** The URL of your tRPC endpoint, such as `http://localhost:3000/trpc`. */
  url: string | URL;
  /**
   * The `fetch` to use, if not the global one.
   */
  fetch?: FetchEsque;
  /**
   * Sends every call as a POST, whatever its type. The server must set
   * `allowMethodOverride: true`.
   * @see https://trpc.io/docs/rpc#overriding-the-default-http-method
   */
  methodOverride?: 'POST';
  /**
   * The character between a procedure path's segments in URLs. Must match
   * the server's `pathSeparator`.
   * @default '.'
   * @see https://trpc.io/docs/rpc#path-separator
   */
  pathSeparator?: PathSeparator;
} & TransformerOptions<TRoot>;
