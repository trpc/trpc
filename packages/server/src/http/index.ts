/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { assertNotBrowser } from '../assertNotBrowser';

// @deprecated delete in next major
export { requestHandler } from '../adapters/node-http/requestHandler';
// @deprecated delete in next major
export type {
  CreateContextFn,
  CreateContextFnOptions,
} from '../adapters/node-http/types';

export * from './ResponseMeta';

assertNotBrowser();
