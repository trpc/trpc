import type { AnyRouter } from '../../core/router';
import { resolveHTTPResponse } from '../../http/resolveHTTPResponse';
import type { NodeHTTPCreateContextFn } from '../node-http/types';
import { getPostBody, sendResponse } from './utils';
import {
  uHTTPRequestHandlerOptions,
  WrappedHTTPRequest,
  WrappedHTTPResponse,
} from './types';
import type { HTTPRequest } from '../../http/internals/types';

type HeaderSet = { name: string; value: string }; //in order to allow multiple of the same header (Set-Cookie) for example

export const uWsHTTPRequestHandler = async <TRouter extends AnyRouter>(
  opts: uHTTPRequestHandlerOptions<TRouter>
) => {
  const resOverride = {
    headers: [] as HeaderSet[],
    status: 0,
  };

  const wrappedRes: WrappedHTTPResponse = {
    setStatus: (status: number) => {
      resOverride.status = status;
    },
    setHeader: (name: string, value: string) => {
      resOverride.headers.push({ name, value });
      // resOverride.headers.set(key, value);
    },
  };

  const createContext = async function _createContext(): Promise<
    | NodeHTTPCreateContextFn<TRouter, WrappedHTTPRequest, WrappedHTTPResponse>
    | undefined
  > {
    return opts.createContext?.({
      req: opts.req,
      res: wrappedRes,
    });
  };
  const { path, router, uRes, req } = opts;
  let aborted = false;
  uRes.onAborted(() => {
    // console.log('request was aborted');
    aborted = true;
  });

  const bodyResult = await getPostBody(req.method, uRes, opts.maxBodySize);
  const query = new URLSearchParams(opts.req.query);
  const requestObj: HTTPRequest = {
    method: opts.req.method,
    headers: opts.req.headers,
    query,
    body: bodyResult.ok ? bodyResult.data : undefined,
  };

  const result = await resolveHTTPResponse({
    batching: opts.batching,
    responseMeta: opts.responseMeta,
    path,
    createContext,
    router,
    req: requestObj,
    error: bodyResult.ok ? null : bodyResult.error,
    onError(o) {
      opts?.onError?.({
        ...o,
        req: opts.req,
      });
    },
  });

  if (aborted) {
    // TODO check this behavior
    return;
  }

  uRes.cork(() => {
    // if ('status' in result && (!res.statusCode || res.statusCode === 200)) {
    if (resOverride.status > 0) {
      uRes.writeStatus(resOverride.status.toString()); // TODO convert code to actual message
    }
    if ('status' in result) {
      uRes.writeStatus(result.status.toString());
    }

    //send our manual headers
    resOverride.headers.forEach((h) => {
      uRes.writeHeader(h.name, h.value);
    });

    for (const [key, value] of Object.entries(result.headers ?? {})) {
      if (typeof value === 'undefined') {
        continue;
      }
      if (Array.isArray(value)) {
        value.forEach((v) => {
          uRes.writeHeader(key, v);
        });
      } else {
        uRes.writeHeader(key, value);
      }
    }

    sendResponse(uRes, result.body);
  });
};
