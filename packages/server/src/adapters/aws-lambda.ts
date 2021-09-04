/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { resolveHttpResponse } from '../http/requestHandler';
import { AnyRouter, inferRouterContext } from '../router';
import { HTTPRequest } from '../http/internals/HTTPResponse';
import { URLSearchParams } from 'url';
import { OnErrorFunction } from '../internals/OnErrorFunction';

function lambdaEventToHTTPRequest(event: APIGatewayProxyEvent): HTTPRequest {
  const usp = new URLSearchParams();
  if (event.multiValueQueryStringParameters) {
    Object.entries(event.multiValueQueryStringParameters).forEach(([k, v]) => {
      if (v) {
        v.forEach((_v) => usp.append(k, _v));
      }
    });
  }
  return {
    method: event.httpMethod,
    query: usp,
    headers: event.headers,
    body: event.body,
  };
}
export interface LambdaTRPCContext<TRouter extends AnyRouter> {
  router: TRouter;
  createContext: (
    event: APIGatewayProxyEvent,
  ) => Promise<inferRouterContext<TRouter>>;
  onError?: OnErrorFunction<TRouter, HTTPRequest>;
}

export function createApiGatewayHandler<TRouter extends AnyRouter>(
  opts: LambdaTRPCContext<TRouter>,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  return async (event: APIGatewayProxyEvent) => {
    const req = lambdaEventToHTTPRequest(event);
    const path = event.path;

    const response = await resolveHttpResponse({
      ...opts,
      createContext: () => opts.createContext(event),
      req,
      path,
      batching: {
        enabled: false,
      },
      error: null,
      responseMeta: () => ({}),
      onError(o) {
        opts.onError?.(o);
      },
    });

    const resp: APIGatewayProxyResult = {
      statusCode: response.status,
      // TODO: Is this stupid?
      body: response.body ? response.body : '',
      // TODO: Can we validate this or write some defensive code to not have potential weird errors coming into lambda output?
      multiValueHeaders: response.headers as Record<
        string | number,
        (string | number | boolean)[]
      >,
    };
    return resp;
  };
}
