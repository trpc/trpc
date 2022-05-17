import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { URLSearchParams } from 'url';
import { resolveHTTPResponse } from '..';
import { HTTPHeaders, HTTPRequest } from '../http/internals/types';
import { AnyRouter, inferRouterContext } from '../router';
import type { AWSLambdaOptions, LambdaContext } from './lambda-utils';

export type { CreateLambdaContextOptions } from './lambda-utils';

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
  opts: AWSLambdaOptions<TRouter>,
): (
  event: APIGatewayProxyEvent,
  context: LambdaContext,
) => Promise<APIGatewayProxyResult> {
  return async (event: APIGatewayProxyEvent, context: LambdaContext) => {
    const req = lambdaEventToHTTPRequest(event);
    const path = event.path;

    const createContext = async function _createContext(): Promise<
      inferRouterContext<TRouter>
    > {
      return await opts.createContext?.({ event, context });
    };

    const response = await resolveHTTPResponse({
      router: opts.router,
      batching: opts.batching,
      responseMeta: opts?.responseMeta,
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
