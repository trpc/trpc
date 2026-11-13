import type { AnyClientTypes } from '@trpc/server/unstable-core-do-not-import';
import type { NonEmptyArray } from '../internals/types';
import type { HTTPLinkBaseOptions } from './internals/httpUtils';
import type { HTTPHeaders, Operation } from './types';

/**
 * The options of `httpBatchLink`.
 * @see https://trpc.io/docs/client/links/httpBatchLink#options
 */
export type HTTPBatchLinkOptions<TRoot extends AnyClientTypes> =
  HTTPLinkBaseOptions<TRoot> & {
    /**
     * The longest URL a batched GET request can have. Calls that would
     * make it longer go in another batch. A call too long on its own
     * fails.
     * @see https://trpc.io/docs/client/links/httpBatchLink#setting-a-maximum-url-length
     * @default Infinity
     */
    maxURLLength?: number;
    /**
     * Headers for each request: an object, or a function of the batch's
     * operations that returns them.
     * @see https://trpc.io/docs/client/headers
     */
    headers?:
      | HTTPHeaders
      | ((opts: {
          opList: NonEmptyArray<Operation>;
        }) => HTTPHeaders | Promise<HTTPHeaders>);

    /**
     * The most calls one batch can have. Set it to the server's
     * `maxBatchSize` or lower.
     * @see https://trpc.io/docs/client/links/httpBatchLink#limiting-batch-size
     * @default Infinity
     */
    maxItems?: number;
    /**
     * Lets a query read parts of its input from the data of another query in
     * the same batch, so a query that depends on another costs no extra round
     * trip. `loadHandles()` uses it for entries built with
     * `experimental_dataOf()`. The server must set
     * `experimental_allowPipelining: true`, or such a batch fails.
     *
     * Batches without such a query are sent as they are without this option.
     *
     * Experimental: it may change in a minor release.
     * @see https://trpc.io/docs/client/tanstack-react-query/dependent-queries#one-request
     * @default false
     */
    experimental_pipelining?: boolean;
  };
