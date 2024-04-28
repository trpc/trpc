/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
  Context as APIGWContext,
} from 'aws-lambda';
import type {
  AnyRouter,
  CreateContextCallback,
  inferRouterContext,
} from '../../@trpc/server';
// import @trpc/server

// @trpc/server
import type {
  HTTPBaseHandlerOptions,
  TRPCRequestInfo,
} from '../../@trpc/server/http';

export type LambdaEvent = APIGatewayProxyEvent | APIGatewayProxyEventV2;

export type APIGatewayResult =
  | APIGatewayProxyResult
  | APIGatewayProxyStructuredResultV2;

export type CreateAWSLambdaContextOptions<TEvent extends LambdaEvent> = {
  event: TEvent;
  context: APIGWContext;
  info: TRPCRequestInfo;
};
export type AWSLambdaCreateContextFn<
  TRouter extends AnyRouter,
  TEvent extends LambdaEvent,
> = ({
  event,
  context,
  info,
}: CreateAWSLambdaContextOptions<TEvent>) =>
  | inferRouterContext<TRouter>
  | Promise<inferRouterContext<TRouter>>;

export type AWSLambdaOptions<
  TRouter extends AnyRouter,
  TEvent extends LambdaEvent,
> =
  | HTTPBaseHandlerOptions<TRouter, TEvent> &
      CreateContextCallback<
        inferRouterContext<AnyRouter>,
        AWSLambdaCreateContextFn<TRouter, TEvent>
      >;

function determinePayloadFormat(event: LambdaEvent): string {
  // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
  // According to AWS support, version is is extracted from the version property in the event.
  // If there is no version property, then the version is implied as 1.0
  const unknownEvent = event as { version?: string };
  if (typeof unknownEvent.version === 'undefined') {
    return '1.0';
  } else {
    return unknownEvent.version;
  }
}

/** 1:1 mapping of v1 or v2 input events, deduces which is which.
 * @internal
 **/
export type inferAPIGWReturn<TEvent> = TEvent extends APIGatewayProxyEvent
  ? APIGatewayProxyResult
  : TEvent extends APIGatewayProxyEventV2
  ? APIGatewayProxyStructuredResultV2
  : never;

interface Processor<TEvent extends LambdaEvent> {
  getTRPCPath: (event: TEvent) => string;
  getURL: (event: TEvent) => URL;
  getHeaders: (event: TEvent) => Headers;
  getMethod: (event: TEvent) => string;
  toResult: (response: Response) => Promise<inferAPIGWReturn<TEvent>>;
}

export function transformHeaders(
  headers: Request['headers'],
): APIGatewayResult['headers'] {
  const obj: APIGatewayResult['headers'] = {};

  for (const [key, value] of headers) {
    if (typeof value === 'undefined') {
      continue;
    }
    obj[key] = value;
  }
  return obj;
}

const v1Processor: Processor<APIGatewayProxyEvent> = {
  // same as getPath above
  getTRPCPath: (event) => {
    if (!event.pathParameters) {
      // Then this event was not triggered by a resource denoted with {proxy+}
      return event.path.split('/').pop() ?? '';
    }
    const matches = event.resource.matchAll(/\{(.*?)\}/g);
    for (const match of matches) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const group = match[1]!;
      if (group.includes('+') && event.pathParameters) {
        return event.pathParameters[group.replace('+', '')] ?? '';
      }
    }
    return event.path.slice(1);
  },

  getURL: (event) => {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(
      event.queryStringParameters ?? {},
    )) {
      if (value !== undefined) {
        searchParams.append(key, value);
      }
    }
    const hostname: string =
      event.requestContext.domainName ??
      event.headers?.['host'] ??
      event.multiValueHeaders?.['host']?.[0] ??
      'localhost';
    const protocol = 'https';
    const path = event.path;

    return new URL(
      `${protocol}://${hostname}${path}?${searchParams.toString()}`,
    );
  },
  getHeaders: (event) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(event.headers ?? {})) {
      if (value !== undefined) {
        headers.append(key, value);
      }
    }

    for (const [k, values] of Object.entries(event.multiValueHeaders ?? {})) {
      if (values) {
        values.forEach((v) => headers.append(k, v));
      }
    }

    return headers;
  },
  getMethod: (event) => event.httpMethod,
  toResult: async (response) => {
    const result: APIGatewayProxyResult = {
      statusCode: response.status,
      body: await response.text(),
      headers: transformHeaders(response.headers),
    };

    return result;
  },
};

const v2Processor: Processor<APIGatewayProxyEventV2> = {
  getTRPCPath: (event) => {
    const matches = event.routeKey.matchAll(/\{(.*?)\}/g);
    for (const match of matches) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const group = match[1]!;
      if (group.includes('+') && event.pathParameters) {
        return event.pathParameters[group.replace('+', '')] ?? '';
      }
    }
    return event.rawPath.slice(1);
  },
  getURL: (event) => {
    const hostname: string = event.requestContext.domainName;
    const protocol: string = event.requestContext.http.protocol;
    const path = event.rawPath;

    return new URL(`${protocol}://${hostname}${path}?${event.rawQueryString}`);
  },
  getHeaders: (event) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(event.headers ?? {})) {
      if (value !== undefined) {
        headers.append(key, value);
      }
    }

    if (event.cookies) {
      headers.append('cookie', event.cookies.join('; '));
    }
    return headers;
  },
  getMethod: (event) => event.requestContext.http.method,
  toResult: async (response) => {
    const result: APIGatewayProxyStructuredResultV2 = {
      statusCode: response.status,
      body: await response.text(),
      headers: transformHeaders(response.headers),
    };

    return result;
  },
};

export function getPlanner<TEvent extends LambdaEvent>(event: TEvent) {
  const version = determinePayloadFormat(event);
  let processor: Processor<TEvent>;
  switch (version) {
    case '1.0':
      processor = v1Processor as Processor<TEvent>;
      break;
    case '2.0':
      processor = v2Processor as Processor<TEvent>;
      break;
    default:
      throw new Error(`Unsupported version: ${version}`);
  }

  const url = processor.getURL(event);

  const init: RequestInit = {
    headers: processor.getHeaders(event),
    method: processor.getMethod(event),
    // @ts-expect-error this is fine
    duplex: 'half',
  };
  if (event.body) {
    init.body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body;
  }

  const request = new Request(url, init);

  return {
    path: processor.getTRPCPath(event),
    request,
    toResult: processor.toResult,
  };
}
