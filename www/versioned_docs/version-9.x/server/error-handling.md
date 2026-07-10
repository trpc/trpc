---
id: error-handling
title: Error Handling
sidebar_label: Error Handling
slug: /error-handling
---

Whenever an error occurs in a procedure, tRPC responds to the client with an object that includes an "error" property. This property contains all the information that you need to handle the error in the client.

Here's an example error response caused by a bad request input:

```json
{
  "id": null,
  "error": {
    "message": "\"password\" must be at least 4 characters",
    "code": -32600,
    "data": {
      "code": "BAD_REQUEST",
      "httpStatus": 400,
      "stack": "...",
      "path": "user.changepassword"
    }
  }
}
```

## Error codes

tRPC defines a list of error codes that each represent a different type of error and response with a different HTTP code.

| Code                  | Description                                                                                                             | HTTP code |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| BAD_REQUEST           | The server cannot or will not process the request due to something that is perceived to be a client error.              | 400       |
| UNAUTHORIZED          | The client request has not been completed because it lacks valid authentication credentials for the requested resource. | 401       |
| FORBIDDEN             | The server was unauthorized to access a required data source, such as a REST API.                                       | 403       |
| NOT_FOUND             | The server cannot find the requested resource.                                                                          | 404       |
| TIMEOUT               | The server would like to shut down this unused connection.                                                              | 408       |
| CONFLICT              | The server request resource conflict with the current state of the target resource.                                     | 409       |
| PRECONDITION_FAILED   | Access to the target resource has been denied.                                                                          | 412       |
| PAYLOAD_TOO_LARGE     | Request entity is larger than limits defined by server.                                                                 | 413       |
| METHOD_NOT_SUPPORTED  | The server knows the request method, but the target resource doesn't support this method.                               | 405       |
| CLIENT_CLOSED_REQUEST | Access to the resource has been denied.                                                                                 | 499       |
| INTERNAL_SERVER_ERROR | An unspecified error occurred.                                                                                          | 500       |

## Throwing errors

tRPC provides an error subclass, `TRPCError`, which you can use to represent an error that occurred inside a procedure.

For example, throwing this error:

```ts title='server.ts'
import * as trpc from '@trpc/server';

const appRouter = trpc.router().query('hello', {
  resolve: () => {
    throw new trpc.TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred, please try again later.',
      // optional: pass the original error to retain stack trace
      cause: theError,
    });
  },
});

// [...]
```

Results to the following response:

```json
{
  "id": null,
  "error": {
    "message": "An unexpected error occurred, please try again later.",
    "code": -32603,
    "data": {
      "code": "INTERNAL_SERVER_ERROR",
      "httpStatus": 500,
      "stack": "...",
      "path": "hello"
    }
  }
}
```

## Handling errors

All errors that occur in a procedure go through the `onError` method before being sent to the client. Here you can handle or change errors.

```ts title='pages/api/trpc/[trpc].ts'
export default trpcNext.createNextApiHandler({
  // ...
  onError({ error, type, path, input, ctx, req }) {
    console.error('Error:', error);
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
    }
  },
});
```

The `onError` parameter is an object that contains all information about the error and the context it occurs in:

```ts
{
  error: TRPCError; // the original error
  type: 'query' | 'mutation' | 'subscription' | 'unknown';
  path: string | undefined; // path of the procedure that was triggered
  input: unknown;
  ctx: Context | undefined;
  req: BaseRequest; // request object
}
```
