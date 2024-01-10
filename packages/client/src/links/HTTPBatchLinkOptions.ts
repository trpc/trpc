import type { NonEmptyArray } from '../internals/types';
import type { HTTPLinkBaseOptions } from './internals/httpUtils';
import type { HTTPHeaders, Operation } from './types';

export interface HTTPBatchLinkOptions extends HTTPLinkBaseOptions {
  maxURLLength?: number;
  /**
   * Headers to be set on outgoing requests or a callback that of said headers
   * @link http://trpc.io/docs/client/headers
   */
  headers?:
    | HTTPHeaders
    | ((opts: {
        opList: NonEmptyArray<Operation>;
      }) => HTTPHeaders | Promise<HTTPHeaders>);
}
/**
 * @alias HttpBatchLinkOptions
 * @deprecated use `HTTPBatchLinkOptions` instead
 */
export interface HttpBatchLinkOptions extends HTTPBatchLinkOptions {}
