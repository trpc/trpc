import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';

export const mockAPIGatewayProxyEvent = ({
  body,
  headers,
  path,
  queryStringParameters,
  method,
}: {
  body: string;
  headers: { [key: string]: string };
  queryStringParameters: Record<string, string>;
  path: string;
  method: string;
}): APIGatewayProxyEvent => {
  return {
    body,
    headers,
    multiValueHeaders: {},
    path: `/${path}`,
    httpMethod: method,
    pathParameters: {},
    isBase64Encoded: false,
    queryStringParameters,
    multiValueQueryStringParameters: null,
    resource: 'mock',
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
}: {
  body: string;
  headers: { [key: string]: string };
  queryStringParameters: Record<string, string>;
  path: string;
  method: string;
}): APIGatewayProxyEventV2 => {
  // version, routeKey, rawQueryString
  return {
    version: '2.0',
    routeKey: 'mock',
    rawQueryString: path,
    body,
    headers,
    rawPath: `/${path}`,
    pathParameters: {},
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
