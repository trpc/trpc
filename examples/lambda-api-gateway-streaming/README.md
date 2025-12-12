# API Gateway REST API + Response Streaming

This example demonstrates tRPC with Amazon API Gateway REST API response streaming, which allows you to stream response payloads back to clients progressively, improving time-to-first-byte (TTFB) and user experience.

This example must be deployed to AWS to work.

```sh
pnpm install
pnpm build
pnpm deploy
```

This will deploy the Lambda function and API Gateway REST API. The API Gateway endpoint URL will be displayed after deployment.

## Server

The server is a tRPC server that uses `awslambda.streamifyResponse()` to enable Lambda response streaming. API Gateway is configured with `responseTransferMode: STREAM` to stream responses from Lambda to clients as they become available.

See the [AWS blog post on API Gateway response streaming](https://aws.amazon.com/blogs/compute/building-responsive-apis-with-amazon-api-gateway-response-streaming/) for more information about this capability.

## Client

Replace `https://???????.execute-api.us-east-1.amazonaws.com/dev` in `src/client.ts` with the API Gateway endpoint URL from the deployment output.

```sh
pnpm start
```
