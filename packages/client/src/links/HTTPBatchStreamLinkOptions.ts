import { HTTPBatchLinkOptions } from './HTTPBatchLinkOptions';
import { TextDecoderEsque } from './internals/streamingUtils';

export interface HTTPBatchStreamLinkOptions extends HTTPBatchLinkOptions {
  /**
   * Will default to the webAPI `TextDecoder`,
   * but you can use this option if your client
   * runtime doesn't provide it.
   */
  textDecoder?: TextDecoderEsque;
}
