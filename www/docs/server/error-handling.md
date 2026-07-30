---
id: error-handling
title: Error Handling
sidebar_label: Error Handling
slug: /server/error-handling
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

## Stack traces in production

By default, tRPC includes `error.data.stack` only when [`isDev`](routers#initialize-trpc) is `true`.
`initTRPC.create()` sets `isDev` to `process.env.NODE_ENV !== 'production'` by default.
If you need deterministic behavior across runtimes, override `isDev` manually.

```ts twoslash title='server.ts'
import { initTRPC } from '@trpc/server';

const t = initTRPC.create({ isDev: false });
```

If you need stricter control over which error fields are returned, use [error formatting](error-formatting).

## Secure Error Reporting in Production

While verbose error messages are helpful during development, they can pose security risks in production environments. According to [OWASP](https://owasp.org/www-community/Improper_Error_Handling), exposing detailed error information can aid attackers in understanding your system's internals and potential vulnerabilities.

### Handling Unknown Exceptions

For unexpected errors that occur in your procedures, return a generic error message to the client while logging the actual error details for debugging purposes.

```ts twoslash title='server.ts'
import { initTRPC, TRPCError } from '@trpc/server';

const t = initTRPC.create({ isDev: false });

const appRouter = t.router({
  createUser: t.procedure.mutation(async ({ input }) => {
    try {
      // Your logic here
      return { success: true };
    } catch (error) {
      // Only handle unknown exceptions - let TRPCError instances pass through
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log the actual error for debugging
      console.error('Unexpected error in createUser:', error);

      // Send to error tracking service
      // Example: Sentry.captureException(error);

      // Return generic error to client
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred. Please try again later.',
      });
    }
  }),
});
```

### Handling Request-Related Errors

Validation errors and other request-related errors can expose implementation details such as field names, validation rules, or library-specific information. While these details are helpful during development, they should be sanitized in production to prevent information leakage.

For example, a default validation error might reveal that you're using Zod for validation or expose internal field structures. To handle this securely, use the [error formatting](error-formatting) feature to transform error responses before they reach the client.

### Using errorFormatter for Production Safety

For stricter control over error responses, use the `errorFormatter` option to strip sensitive information and normalize error messages.

```ts twoslash title='server.ts'
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create({
  isDev: false,
  errorFormatter(opts) {
    const { shape, error } = opts;

    return {
      ...shape,
      data: {
        code: shape.data.code,
        httpStatus: shape.data.httpStatus,
        // Always remove stack traces in production
        stack: undefined,
        // For request-related errors, use generic messages
        message: error.code === 'BAD_REQUEST'
          ? 'Invalid input. Please check your request and try again.'
          : shape.message,
      },
    };
  },
});
```

### Integrating with onError Callback

Use the `onError` callback to log errors and send them to external monitoring services without exposing details to the client.

```ts twoslash title='server.ts'
// @filename: router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: server.ts
// ---cut---
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';

const server = createHTTPServer({
  router: appRouter,
  onError(opts) {
    const { error, type, path, input, ctx, req } = opts;

    // Log error details for debugging
    console.error('Error:', {
      type,
      path,
      code: error.code,
      message: error.message,
    });

    // Send to error tracking service
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // Example: Sentry.captureException(error);
    }
  },
});
```

:::tip

For comprehensive error tracking, consider integrating with error monitoring services. These services provide error aggregation, alerting, and detailed debugging information while keeping your production responses secure.

:::

## Error codes

tRPC defines a list of error codes that each represent a different type of error and response with a different HTTP code.

| Code                   | Description                                                                                                                                                                                                                                                                                      | HTTP code |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| PARSE_ERROR            | Invalid JSON was received by the server, or an error occurred while parsing the request.                                                                                                                                                                                                         | 400       |
| BAD_REQUEST            | The server cannot or will not process the request due to something that is perceived to be a client error.                                                                                                                                                                                       | 400       |
| UNAUTHORIZED           | The client request has not been completed because it lacks valid authentication credentials for the requested resource.                                                                                                                                                                          | 401       |
| PAYMENT_REQUIRED       | The client request requires payment to access the requested resource.                                                                                                                                                                                                                            | 402       |
| FORBIDDEN              | The client is not authorized to access the requested resource.                                                                                                                                                                                                                                   | 403       |
| NOT_FOUND              | The server cannot find the requested resource.                                                                                                                                                                                                                                                   | 404       |
| METHOD_NOT_SUPPORTED   | The server knows the request method, but the target resource doesn't support this method.                                                                                                                                                                                                        | 405       |
| TIMEOUT                | The server would like to shut down this unused connection.                                                                                                                                                                                                                                       | 408       |
| CONFLICT               | The request conflicts with the current state of the target resource.                                                                                                                                                                                                                             | 409       |
| PRECONDITION_FAILED    | Access to the target resource has been denied.                                                                                                                                                                                                                                                   | 412       |
| PAYLOAD_TOO_LARGE      | Request entity is larger than limits defined by server.                                                                                                                                                                                                                                          | 413       |
| UNSUPPORTED_MEDIA_TYPE | The server refuses to accept the request because the payload format is in an unsupported format.                                                                                                                                                                                                 | 415       |
| UNPROCESSABLE_CONTENT  | The server understands the request method, and the request entity is correct, but the server was unable to process it.                                                                                                                                                                           | 422       |
| PRECONDITION_REQUIRED  | [The server cannot process the request because a required precondition header (such as `If-Match`) is missing. When a precondition header does not match the server-side state, the response should be `412 Precondition Failed`.](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/428) | 428       |
| TOO_MANY_REQUESTS      | The rate limit has been exceeded or too many requests are being sent to the server.                                                                                                                                                                                                              | 429       |
| CLIENT_CLOSED_REQUEST  | The client closed the connection before the server finished responding.                                                                                                                                                                                                                          | 499       |
| INTERNAL_SERVER_ERROR  | An unspecified error occurred.                                                                                                                                                                                                                                                                   | 500       |
| NOT_IMPLEMENTED        | The server does not support the functionality required to fulfill the request.                                                                                                                                                                                                                   | 501       |
| BAD_GATEWAY            | The server received an invalid response from the upstream server.                                                                                                                                                                                                                                | 502       |
| SERVICE_UNAVAILABLE    | The server is not ready to handle the request.                                                                                                                                                                                                                                                   | 503       |
| GATEWAY_TIMEOUT        | The server did not get a response in time from the upstream server that it needed in order to complete the request.                                                                                                                                                                              | 504       |

tRPC exposes a helper function, `getHTTPStatusCodeFromError`, to help you extract the HTTP code from the error:

```ts twoslash
import { TRPCError } from '@trpc/server';
// ---cut---
import { getHTTPStatusCodeFromError } from '@trpc/server/http';

// Example error you might get if your input validation fails
const error: TRPCError = {
  name: 'TRPCError',
  code: 'BAD_REQUEST',
  message: '"password" must be at least 4 characters',
};

if (error instanceof TRPCError) {
  const httpCode = getHTTPStatusCodeFromError(error);
  console.log(httpCode); // 400
}
```

:::tip

There's a full example of how error handling works in a server-side context in the [Server Side Calls docs](server-side-calls).

:::

## Throwing errors

tRPC provides an error subclass, `TRPCError`, which you can use to represent an error that occurred inside a procedure.

For example, throwing this error:

```ts twoslash title='server.ts'
import { initTRPC, TRPCError } from '@trpc/server';

const t = initTRPC.create();

const theError = new Error('something went wrong');

const appRouter = t.router({
  hello: t.procedure.query(() => {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred, please try again later.',
      // optional: pass the original error to retain stack trace
      cause: theError,
    });
  }),
});

// [...]
```

Results in the following response:

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

All errors that occur in a procedure go through the `onError` method before being sent to the client. Here you can handle errors (To change errors see [error formatting](error-formatting)).

```ts twoslash title='server.ts'
// @filename: router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: server.ts
// ---cut---
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';

const server = createHTTPServer({
  router: appRouter,
  onError(opts) {
    const { error, type, path, input, ctx, req } = opts;
    console.error('Error:', error);
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
    }
  },
});
```

The `onError` parameter is an object that contains all information about the error and the context it occurs in:

```ts twoslash
import { TRPCError } from '@trpc/server';
// ---cut---
interface OnErrorOpts {
  error: TRPCError;
  type: 'query' | 'mutation' | 'subscription' | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: unknown;
  req: Request;
}
```
