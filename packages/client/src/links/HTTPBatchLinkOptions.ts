import type { AnyClientTypes } from '@trpc/server/unstable-core-do-not-import';
import type { NonEmptyArray } from '../internals/types';
import type { HTTPLinkBaseOptions } from './internals/httpUtils';
import type { HTTPHeaders, Operation } from './types';

export type HTTPBatchLinkOptions<TRoot extends AnyClientTypes> =
  HTTPLinkBaseOptions<TRoot> & {
    maxURLLength?: number;
    /**
     * Headers to be set on outgoing requests or a callback that of said headers
     * @see http://trpc.io/docs/client/headers
     */
    headers?:
      | HTTPHeaders
      | ((opts: {
          opList: NonEmptyArray<Operation>;
        }) => HTTPHeaders | Promise<HTTPHeaders>);

    /**
     * Maximum number of calls in a single batch request
     * @default Infinity
     */
    maxItems?: number;
  };
