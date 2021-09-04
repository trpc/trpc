/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { URLSearchParams } from 'url';
import { CreateContextFnOptions } from '../';
import { CreateContextFn } from '../http';
import { HTTPHandlerOptionsBase } from '../http/internals/HTTPHandlerOptions';
import { HTTPHeaders, HTTPRequest } from '../http/internals/HTTPResponse';
import { resolveHttpResponse } from '../http/requestHandler';
import { AnyRouter, inferRouterContext } from '../router';
function lambdaEventToHTTPRequest(event: APIGatewayProxyEvent): HTTPRequest {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(
    event.multiValueQueryStringParameters ?? {},
  )) {
    for (const v of value ?? []) {
      query.append(key, v);
    }
  }
  return {
    method: event.httpMethod,
    query,
    headers: event.headers,
    body: event.body,
  };
}

export type CreateLambdaContextOptions =
  CreateContextFnOptions<APIGatewayProxyEvent>;
type AWSLambdaOptions<
  TRouter extends AnyRouter,
  TRequest,
> = HTTPHandlerOptionsBase<TRouter, TRequest> &
  (inferRouterContext<TRouter> extends void
    ? {
        /**
         * @link https://trpc.io/docs/context
         **/
        createContext?: CreateContextFn<TRouter, TRequest>;
      }
    : {
        /**
         * @link https://trpc.io/docs/context
         **/
        createContext: CreateContextFn<TRouter, TRequest>;
      });

function transformHeaders(
  headers: HTTPHeaders,
): APIGatewayProxyResult['headers'] {
  const obj: APIGatewayProxyResult['headers'] = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined') {
      continue;
    }
    obj[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return obj;
}

export function createApiGatewayHandler<TRouter extends AnyRouter>(
  opts: AWSLambdaOptions<TRouter, APIGatewayProxyEvent>,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  return async (event: APIGatewayProxyEvent) => {
    const req = lambdaEventToHTTPRequest(event);
    const path = event.path;

    const createContext = async function _createContext(): Promise<
      inferRouterContext<TRouter>
    > {
      return await opts.createContext?.({
        req: event,
        res: undefined,
      });
    };

    const response = await resolveHttpResponse({
      router: opts.router,
      batching: opts.batching,
      responseMeta: opts.responseMeta,
      createContext,
      req,
      path,
      error: null,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: event,
        });
      },
    });

    const resp: APIGatewayProxyResult = {
      statusCode: response.status,
      body: response.body ?? '',
      headers: transformHeaders(response.headers ?? {}),
    };
    return resp;
  };
}
