# Lambda URL + Response Streaming

This example must be deployed to AWS to work.

```sh
pnpm install
pnpm build
pnpm deploy
```

This will deploy the Lambda function and create a Lambda URL in the format of `https://<your-lambda-url>.lambda-url.us-east-1.on.aws/`.

## Server

The server is a simple TRPC server that uses the `awslambda.streamifyResponse()` function to stream the response to the client. See this [blog post](https://aws.amazon.com/blogs/compute/introducing-aws-lambda-response-streaming/) for more information about AWS Lambda response streaming.

## Client

Replace `YOUR_LAMBDA_URL` in `src/client.ts` with the Lambda URL you just created.

```sh
pnpm start
```
