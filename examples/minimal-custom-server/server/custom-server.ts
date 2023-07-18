/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createServer, IncomingMessage, ServerResponse } from 'http';

// The query type here is just to show it might
// not extend express's req.query type
// invalidTrpcQuery is used to let trpc know that passing the query to URLSearchParams would cause it to throw
type AugmentedRequest = IncomingMessage & {
  query?: any[] | Record<string, any>;
  invalidTrpcQuery?: boolean;
  pathname: string;
};

// Add new properties and methods to our request object
const augmentRequest = (req: IncomingMessage): AugmentedRequest => {
  const url = new URL(req.url!, `https://${req.headers.host}`);
  const { searchParams, pathname } = url;
  return Object.assign(req, {
    query: searchParams,
    invalidTrpcQuery: true,
    pathname,
  });
};

type AugmentedResponse = ReturnType<typeof augmentResponse>;

// Add new properties and methods to our response object
const augmentResponse = (res: ServerResponse<IncomingMessage>) =>
  Object.assign(res, {
    customMethod(callLocation: string) {
      console.log(`customMethod called from: ${callLocation}`);
    },
  });

type AugmentedHandler = (
  req: AugmentedRequest,
  res: AugmentedResponse,
) => Promise<void>;

// We are only creating a custom server here to show how we can use trpc with
// any server and make sure type checking works throught your application
const createCustomServer = (requestListner: AugmentedHandler) =>
  createServer((req, res) => {
    return requestListner(augmentRequest(req), augmentResponse(res));
  });

export { createCustomServer, AugmentedRequest, AugmentedResponse };
