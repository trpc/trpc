export type { HTTPRequest, HTTPBaseHandlerOptions } from './internals/types';

export interface ResponseMeta {
  status?: number;
  headers?: Record<string, string>;
}
