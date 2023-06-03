import { NonEmptyArray } from '../internals/types';
import { HTTPLinkBaseOptions } from './internals/httpUtils';
import { TextDecoderEsque } from "./internals/streamingUtils"
import { HTTPHeaders, Operation } from './types';

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
  
  /**
   * Used for `httpBatchStreamLink`. Will default to the webAPI `TextDecoder`,
   * but you can use this option if your client runtime doesn't provide it.
   */
  textDecoder?: TextDecoderEsque;
}
/**
 * @alias HttpBatchLinkOptions
 * @deprecated use `HTTPBatchLinkOptions` instead
 */
export interface HttpBatchLinkOptions extends HTTPBatchLinkOptions {}
