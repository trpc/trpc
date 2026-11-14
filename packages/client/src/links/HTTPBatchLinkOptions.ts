import type { AnyClientTypes } from '@trpc/server/unstable-core-do-not-import';
import type { NonEmptyArray } from '../internals/types';
import type { HTTPLinkBaseOptions } from './internals/httpUtils';
import type { experimental_Pipelining } from './internals/pipeline';
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
     * Lets the server run more queries in a query's request, with parts of
     * their inputs read from its data, so a query that depends on another
     * costs no extra round trip. `loadHandles()` uses it for entries built
     * with `experimental_dataOf()`. The server must set
     * `experimental_allowPipelining: true`, or such a request fails.
     *
     * Pass `experimental_pipelining()` from `@trpc/client`. Its code is only in
     * the bundle of an app that does.
     *
     * Such a query is no operation of its own, so the links before this one
     * don't see it. Batches without one are sent as they are without this
     * option.
     *
     * Experimental: it may change in a minor release.
     * @see https://trpc.io/docs/client/tanstack-react-query/dependent-queries#one-request
     */
    experimental_pipelining?: experimental_Pipelining;
  };
