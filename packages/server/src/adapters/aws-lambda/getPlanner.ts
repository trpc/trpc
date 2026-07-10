import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { splitSetCookieString } from '../../vendor/cookie-es/set-cookie/split';

export type LambdaEvent = APIGatewayProxyEvent | APIGatewayProxyEventV2;

export type APIGatewayResult =
  | APIGatewayProxyResult
  | APIGatewayProxyStructuredResultV2;

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
  url(event: TEvent): Pick<URL, 'hostname' | 'pathname' | 'search'>;
  getHeaders: (event: TEvent) => Headers;
  getMethod: (event: TEvent) => string;
  toResult: (response: Response) => Promise<inferAPIGWReturn<TEvent>>;
  toStream: (response: Response, stream: Writable) => Promise<void>;
}

function getHeadersAndCookiesFromResponse(response: Response) {
  const headers = Object.fromEntries(response.headers.entries());

  const cookies: string[] = splitSetCookieString(
    response.headers.getSetCookie(),
  ).map((cookie) => cookie.trim());

  delete headers['set-cookie'];

  return { headers, cookies };
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
  url(event) {
    const hostname: string =
      event.requestContext.domainName ??
      event.headers['host'] ??
      event.multiValueHeaders?.['host']?.[0] ??
      'localhost';

    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(
      event.queryStringParameters ?? {},
    )) {
      if (value !== undefined) {
        searchParams.append(key, value);
      }
    }
    const qs = searchParams.toString();
    return {
      hostname,
      pathname: event.path,
      search: qs && `?${qs}`,
    };
  },
  getHeaders: (event) => {
    const headers = new Headers();

    // Process multiValueHeaders first (takes precedence per AWS docs)
    // This handles headers that can have multiple values
    for (const [k, values] of Object.entries(event.multiValueHeaders ?? {})) {
      if (values) {
        values.forEach((v) => headers.append(k, v));
      }
    }

    // Then process single-value headers, but skip any that were already
    // added from multiValueHeaders to avoid duplication
    for (const [key, value] of Object.entries(event.headers ?? {})) {
      if (value !== undefined && !headers.has(key)) {
        headers.append(key, value);
      }
    }

    return headers;
  },
  getMethod: (event) => event.httpMethod,
  toResult: async (response) => {
    const { headers, cookies } = getHeadersAndCookiesFromResponse(response);

    const result: APIGatewayProxyResult = {
      ...(cookies.length && { multiValueHeaders: { 'set-cookie': cookies } }),
      statusCode: response.status,
      body: await response.text(),
      headers,
    };

    return result;
  },
  toStream: async (response, stream) => {
    const { headers, cookies } = getHeadersAndCookiesFromResponse(response);

    const metadata = {
      statusCode: response.status,
      headers,
      cookies,
    };

    const responseStream = awslambda.HttpResponseStream.from(stream, metadata);

    if (response.body) {
      await pipeline(Readable.fromWeb(response.body as any), responseStream);
    } else {
      responseStream.end();
    }
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
  url(event) {
    return {
      hostname: event.requestContext.domainName,
      pathname: event.rawPath,
      search: event.rawQueryString && `?${event.rawQueryString}`,
    };
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
    const { headers, cookies } = getHeadersAndCookiesFromResponse(response);

    const result: APIGatewayProxyStructuredResultV2 = {
      cookies,
      statusCode: response.status,
      body: await response.text(),
      headers,
    };

    return result;
  },

  toStream: async (response, stream) => {
    const { headers, cookies } = getHeadersAndCookiesFromResponse(response);

    const metadata = {
      statusCode: response.status,
      headers,
      cookies,
    };

    const responseStream = awslambda.HttpResponseStream.from(stream, metadata);

    if (response.body) {
      await pipeline(Readable.fromWeb(response.body as any), responseStream);
    } else {
      responseStream.end();
    }
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

  const urlParts = processor.url(event);
  const url = `https://${urlParts.hostname}${urlParts.pathname}${urlParts.search}`;

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
    toStream: processor.toStream,
  };
}
