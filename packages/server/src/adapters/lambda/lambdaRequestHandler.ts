import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { resolveHTTPResponse } from '../..';
import { HTTPHeaders, HTTPRequest } from '../../http/internals/types';
import type { HTTPResponse } from '../../http/internals/types';
import { AnyRouter, inferRouterContext } from '../../router';
import type {
  APIGatewayEvent,
  APIGatewayResult,
  AWSLambdaOptions,
  LambdaContext,
} from './utils';
import {
  UNKNOWN_PAYLOAD_FORMAT_VERSION,
  isPayloadV1,
  isPayloadV2,
} from './utils';

export type { CreateLambdaContextOptions } from './utils';

function lambdaEventToHTTPRequest(event: APIGatewayEvent): HTTPRequest {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(
    event.queryStringParameters ?? {},
  )) {
    if (value) {
      console.log('Q', key, value);
      query.append(key, value);
    }
  }

  return {
    method: getHTTPMethod(event),
    query: query,
    headers: event.headers,
    body: event.body,
  };
}

function getHTTPMethod(event: APIGatewayEvent) {
  if (isPayloadV1(event)) {
    return event.httpMethod;
  } else if (isPayloadV2(event)) {
    return event.requestContext.http.method;
  } else {
    throw UNKNOWN_PAYLOAD_FORMAT_VERSION;
  }
}
function getPath(event: APIGatewayEvent) {
  if (isPayloadV1(event)) {
    return event.path;
  } else if (isPayloadV2(event)) {
    return event.rawPath;
  } else {
    throw UNKNOWN_PAYLOAD_FORMAT_VERSION;
  }
}
function transformHeadersV1(
  headers: HTTPHeaders,
): APIGatewayProxyResult['headers'] {
  const obj: APIGatewayProxyResult['headers'] = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined') {
      continue;
    }
    obj[key] = Array.isArray(value) ? value.join(',') : value;
  }
  return obj;
}
function transformHeadersV2(
  headers: HTTPHeaders,
): APIGatewayProxyStructuredResultV2['headers'] {
  const obj: APIGatewayProxyStructuredResultV2['headers'] = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined') {
      continue;
    }
    obj[key] = Array.isArray(value) ? value.join(',') : value;
  }
  return obj;
}

function tRPCOutputToAPIGatewayOutput<
  TEvent extends APIGatewayEvent,
  TResult extends APIGatewayResult,
>(event: TEvent, response: HTTPResponse): TResult {
  if (isPayloadV1(event)) {
    const resp: APIGatewayProxyResult = {
      statusCode: response.status,
      body: response.body ?? '',
      headers: transformHeadersV1(response.headers ?? {}),
    };
    return resp as TResult;
  } else if (isPayloadV2(event)) {
    const resp: APIGatewayProxyStructuredResultV2 = {
      statusCode: response.status,
      body: response.body ?? '',
      headers: transformHeadersV2(response.headers ?? {}),
    };
    return resp as TResult;
  } else {
    throw UNKNOWN_PAYLOAD_FORMAT_VERSION;
  }
}

type APIGWReturn<T> = T extends APIGatewayProxyEvent
  ? APIGatewayProxyResult
  : T extends APIGatewayProxyEventV2
  ? APIGatewayProxyStructuredResultV2
  : never;
export function lambdaRequestHandler<
  TRouter extends AnyRouter,
  TEvent extends APIGatewayEvent,
  TResult extends APIGWReturn<TEvent>,
>(
  opts: AWSLambdaOptions<TRouter, TEvent>,
): (event: TEvent, context: LambdaContext) => Promise<TResult> {
  return async (event, context) => {
    const req = lambdaEventToHTTPRequest(event);
    const path = getPath(event);
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

    return tRPCOutputToAPIGatewayOutput<TEvent, TResult>(event, response);
  };
}
