import http from 'http';
import qs from 'qs';
import { AnyRouter } from '../router';
import { OnErrorFunction } from './OnErrorFunction';

export type BaseRequest = http.IncomingMessage & {
  method?: string;
  query?: qs.ParsedQs;
  body?: any;
};
export type BaseResponse = http.ServerResponse;

/**
 * Base interface for any HTTP/WSS handlers
 */
export interface BaseHandlerOptions<TRouter extends AnyRouter, TRequest> {
  onError?: OnErrorFunction<TRouter, TRequest>;
  batching?: {
    enabled: boolean;
  };
  router: TRouter;
}
