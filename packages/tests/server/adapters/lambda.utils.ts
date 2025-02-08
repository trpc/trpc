import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventPathParameters,
  APIGatewayProxyEventV2,
  Context,
} from 'aws-lambda';

export const mockAPIGatewayProxyEventV1 = ({
  body,
  headers,
  path,
  queryStringParameters,
  method,
  resource,
  pathParameters,
}: {
  body?: string;
  headers: { [key: string]: string };
  queryStringParameters: Record<string, string>;
  path: string;
  method: string;
  resource: string;
  pathParameters?: APIGatewayProxyEventPathParameters;
}): APIGatewayProxyEvent => {
  return {
    body: body ?? null,
    headers,
    multiValueHeaders: {},
    path: `/${path}`,
    httpMethod: method,
    isBase64Encoded: false,
    queryStringParameters,
    multiValueQueryStringParameters: null,
    resource,
    pathParameters: pathParameters ?? null,
    stageVariables: {},
    requestContext: {
      accountId: 'mock',
      apiId: 'mock',
      path: 'mock',
      protocol: 'mock',
      httpMethod: method,
      stage: 'mock',
      requestId: 'mock',
      requestTimeEpoch: 123,
      resourceId: 'mock',
      resourcePath: 'mock',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: 'mock',
        user: null,
        userAgent: null,
        userArn: null,
      },
      authorizer: {},
    },
  };
};

export const mockAPIGatewayProxyEventV2 = ({
  body,
  headers,
  path,
  queryStringParameters,
  method,
  routeKey,
  pathParameters,
}: {
  body?: string;
  headers: { [key: string]: string };
  queryStringParameters: Record<string, string>;
  path: string;
  method: string;
  routeKey: string;
  pathParameters?: { [key: string]: string };
}): APIGatewayProxyEventV2 => {
  return {
    version: '2.0',
    routeKey,
    rawQueryString: path,
    body,
    headers,
    rawPath: `/${path}`,
    pathParameters,
    isBase64Encoded: false,
    queryStringParameters: queryStringParameters,
    stageVariables: {},
    requestContext: {
      accountId: 'mock',
      apiId: 'mock',
      stage: 'mock',
      requestId: 'mock',
      domainName: 'mock',
      domainPrefix: 'mock',
      http: {
        method: method,
        path: 'mock',
        protocol: 'mock',
        sourceIp: 'mock',
        userAgent: 'mock',
      },
      routeKey: 'mock',
      time: 'mock',
      timeEpoch: 0,
    },
  };
};

export const mockAPIGatewayContext = (): Context => {
  return {
    functionName: 'mock',
    callbackWaitsForEmptyEventLoop: true,
    functionVersion: 'mock',
    invokedFunctionArn: 'mock',
    memoryLimitInMB: 'mock',
    awsRequestId: 'mock',
    logGroupName: 'mock',
    logStreamName: 'mock',
    getRemainingTimeInMillis: () => -1,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    done: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    fail: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    succeed: () => {},
  };
};

export const mockAPIGatewayProxyEventBase64Encoded = (
  event: APIGatewayProxyEvent,
) => {
  if (event.body) {
    return {
      ...event,
      isBase64Encoded: true,
      body: Buffer.from(event.body, 'utf8').toString('base64'),
    } as APIGatewayProxyEvent;
  } else {
    return event;
  }
};
