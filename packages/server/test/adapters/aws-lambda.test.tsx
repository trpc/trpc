/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import * as trpc from '../../src';
import * as trpcLambda from '../../src/adapters/aws-lambda';
import { APIGatewayProxyEvent } from 'aws-lambda';

type Context = {
  user?: string;
};

const router = trpc.router<Context>().query('hello', {
  input: z
    .object({
      who: z.string().nullish(),
    })
    .nullish(),
  resolve({ input, ctx }) {
    return {
      text: `hello ${input?.who ?? ctx.user ?? 'world'}`,
    };
  },
});
const createContext = async (event: APIGatewayProxyEvent) => {
  return {
    user: event.headers['X-USER'],
  };
};
const handler = trpcLambda.createApiGatewayHandler({
  router,
  createContext,
});

const mockAPIGatewayProxyEvent = ({
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

test('basic test', async () => {
  expect(
    await handler(
      mockAPIGatewayProxyEvent({
        body: JSON.stringify({ who: 'test' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'GET',
        path: '/greet',
      }),
    ),
  ).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);
});
