import type { APIGatewayProxyEvent } from 'aws-lambda';

export const mockAPIGatewayProxyEvent = ({
  body,
  headers,
  path,
  method,
}: {
  body: string;
  headers: { [key: string]: string };
  path: string;
  method: string;
}): APIGatewayProxyEvent => {
  return {
    body,
    headers,
    multiValueHeaders: {},
    path,
    httpMethod: method,
    pathParameters: {},
    isBase64Encoded: false,
    queryStringParameters: null,
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
