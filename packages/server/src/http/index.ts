/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { assertNotBrowser } from '../assertNotBrowser';
import { requestHandler as requestHandlerInner } from '../adapters/node-http/requestHandler';

// @deprecated delete in next major
/**
 * @deprecated will be removed in next major
 */
export const requestHandler: typeof requestHandlerInner = requestHandlerInner;
// @deprecated delete in next major
export type {
  /**
   * @deprecated
   */
  NodeHTTPCreateContextFn as CreateContextFn,
  /**
   * @deprecated
   */
  NodeHTTPCreateContextFnOptions as CreateContextFnOptions,
} from '../adapters/node-http/types';

export * from './resolveHTTPResponse';
export * from './ResponseMeta';

assertNotBrowser();
