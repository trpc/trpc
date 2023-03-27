import type { HttpResponse } from 'uWebSockets.js';

import type { AnyRouter } from '../../core/router';
import type {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPCreateContextOption,
} from '../node-http/types';
import type { HTTPBaseHandlerOptions } from '../../http/internals/types';

export type WrappedHTTPRequest = {
  headers: Record<string, string>;
  method: 'GET' | 'POST';
  query: string;
  url: string;
};

export type WrappedHTTPResponse = {
  setStatus: (status: number) => void;
  setHeader: (key: string, value: string) => void;
};

export type uHTTPHandlerOptions<TRouter extends AnyRouter> =
  HTTPBaseHandlerOptions<TRouter, WrappedHTTPRequest> &
  NodeHTTPCreateContextOption<
    TRouter,
    WrappedHTTPRequest,
    WrappedHTTPResponse
  > & {
    maxBodySize?: number;
  };

export type uHTTPRequestHandlerOptions<TRouter extends AnyRouter> =
  uHTTPHandlerOptions<TRouter> & {
    req: WrappedHTTPRequest;
    uRes: HttpResponse;
    path: string;
  };

export type CreateContextOptions = NodeHTTPCreateContextFnOptions<
  WrappedHTTPRequest,
  WrappedHTTPResponse
>;
