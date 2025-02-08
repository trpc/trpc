---
id: rpc
title: HTTP RPC Specification
sidebar_label: HTTP RPC Specification
slug: /rpc
---

## Methods \<-> Type mapping

| HTTP Method  | Mapping           | Notes                                                                                                          |
| ------------ | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET`        | `.query()`        | Input JSON-stringified in query param.<br/>_e.g._ `myQuery?input=${encodeURIComponent(JSON.stringify(input))}` |
| `POST`       | `.mutation()`     | Input as POST body.                                                                                            |
| <em>n/a</em> | `.subscription()` | <em>Subscriptions are not supported in HTTP transport</em>                                                     |

## Accessing nested procedures

Nested procedures are separated by dots, so for a request to `byId` below would end up being a request to `/api/trpc/post.byId`.

```ts
export const appRouter = router({
  post: router({
    byId: publicProcedure.input(String).query(async (opts) => {
      // [...]
    }),
  }),
});
```

## Batching

When batching, we combine all parallel procedure calls of the same HTTP method in one request using a data loader.

- The called procedures' names are combined by a comma (`,`) in the `pathname`
- Input parameters are sent as a query parameter called `input` which has the shape `Record<number, unknown>`.
- We also need to pass `batch=1` as a query parameter.
- If the response has different statuses, we send back `207 Multi-Status` _(e.g., if one call errored and one succeeded) _

### Batching Example Request

#### Given a router like this exposed at `/api/trpc`:

```tsx title='server/router.ts'
export const appRouter = t.router({
  postById: t.procedure.input(String).query(async (opts) => {
    const post = await opts.ctx.post.findUnique({
      where: { id: opts.input },
    });
    return post;
  }),
  relatedPosts: t.procedure.input(String).query(async (opts) => {
    const posts = await opts.ctx.findRelatedPostsById(opts.input);
    return posts;
  }),
});
```

#### ... And two queries defined like this in a React component:

```tsx title='MyComponent.tsx'
export function MyComponent() {
  const post1 = trpc.postById.useQuery('1');
  const relatedPosts = trpc.relatedPosts.useQuery('1');

  return (
    <pre>
      {JSON.stringify(
        {
          post1: post1.data ?? null,
          relatedPosts: relatedPosts.data ?? null,
        },
        null,
        4,
      )}
    </pre>
  );
}
```

#### The above would result in exactly 1 HTTP call with this data:

| Location property | Value                                                           |
| ----------------- | --------------------------------------------------------------- |
| `pathname`        | `/api/trpc/postById,relatedPosts`                               |
| `search`          | `?batch=1&input=%7B%220%22%3A%221%22%2C%221%22%3A%221%22%7D` \* |

**\*) `input` in the above is the result of:**

```ts
encodeURIComponent(
  JSON.stringify({
    0: '1', // <-- input for `postById`
    1: '1', // <-- input for `relatedPosts`
  }),
);
```

### Batching Example Response

<details>
  <summary>Example output from server</summary>

```json
[
  // result for `postById`
  {
    "result": {
      "data": {
        "id": "1",
        "title": "Hello tRPC",
        "body": "..."
        // ...
      }
    }
  },
  // result for `relatedPosts`
  {
    "result": {
      "data": [
        /* ... */
      ]
    }
  }
]
```

</details>

## HTTP Response Specification

In order to have a specification that works regardless of the transport layer we try to conform to [JSON-RPC 2.0](https://www.jsonrpc.org/specification) where possible.

### Successful Response

<details>
<summary>Example JSON Response</summary>

```json
{
  "result": {
    "data": {
      "id": "1",
      "title": "Hello tRPC",
      "body": "..."
    }
  }
}
```

</details>

```ts
{
  result: {
    data: TOutput; // output from procedure
  }
}
```

### Error Response

<details>
<summary>Example JSON Response</summary>

```json
[
  {
    "error": {
      "json": {
        "message": "Something went wrong",
        "code": -32600, // JSON-RPC 2.0 code
        "data": {
          // Extra, customizable, meta data
          "code": "INTERNAL_SERVER_ERROR",
          "httpStatus": 500,
          "stack": "...",
          "path": "post.add"
        }
      }
    }
  }
]
```

</details>
<br/>

- When possible, we propagate HTTP status codes from the error thrown.
- If the response has different statuses, we send back `207 Multi-Status` _(e.g., if one call errored and one succeeded) _
- For more on errors and how to customize them see [Error Formatting](../server/error-formatting.md).

## Error Codes \<-> HTTP Status

```ts
PARSE_ERROR: 400,
BAD_REQUEST: 400,
UNAUTHORIZED: 401,
FORBIDDEN: 403,
NOT_FOUND: 404,
METHOD_NOT_SUPPORTED: 405,
TIMEOUT: 408,
CONFLICT: 409,
PRECONDITION_FAILED: 412,
PAYLOAD_TOO_LARGE: 413,
UNSUPPORTED_MEDIA_TYPE: 415,
UNPROCESSABLE_CONTENT: 422,
TOO_MANY_REQUESTS: 429,
CLIENT_CLOSED_REQUEST: 499,
INTERNAL_SERVER_ERROR: 500,
NOT_IMPLEMENTED: 501,
BAD_GATEWAY: 502,
SERVICE_UNAVAILABLE: 503,
GATEWAY_TIMEOUT: 504,
```

## Error Codes \<-> JSON-RPC 2.0 Error Codes

<details>
<summary>Available codes & JSON-RPC code</summary>

```ts
/**
 * JSON-RPC 2.0 Error codes
 *
 * `-32000` to `-32099` are reserved for implementation-defined server-errors.
 * For tRPC we're copying the last digits of HTTP 4XX errors.
 */
export const TRPC_ERROR_CODES_BY_KEY = {
  /**
   * Invalid JSON was received by the server.
   * An error occurred on the server while parsing the JSON text.
   */
  PARSE_ERROR: -32700,
  /**
   * The JSON sent is not a valid Request object.
   */
  BAD_REQUEST: -32600, // 400

  // Internal JSON-RPC error
  INTERNAL_SERVER_ERROR: -32603, // 500
  NOT_IMPLEMENTED: -32603, // 501
  BAD_GATEWAY: -32603, // 502
  SERVICE_UNAVAILABLE: -32603, // 503
  GATEWAY_TIMEOUT: -32603, // 504

  // Implementation specific errors
  UNAUTHORIZED: -32001, // 401
  FORBIDDEN: -32003, // 403
  NOT_FOUND: -32004, // 404
  METHOD_NOT_SUPPORTED: -32005, // 405
  TIMEOUT: -32008, // 408
  CONFLICT: -32009, // 409
  PRECONDITION_FAILED: -32012, // 412
  PAYLOAD_TOO_LARGE: -32013, // 413
  UNSUPPORTED_MEDIA_TYPE: -32015, // 415
  UNPROCESSABLE_CONTENT: -32022, // 422
  TOO_MANY_REQUESTS: -32029, // 429
  CLIENT_CLOSED_REQUEST: -32099, // 499
} as const;
```

</details>

### Overriding the default HTTP method

To override the HTTP method used for queries/mutations, you can use the `methodOverride` option:

```tsx title = 'server/httpHandler.ts'
// Your server must separately allow the client to override the HTTP method
const handler = createHTTPHandler({
  router: router,
  allowMethodOverride: true,
});
```

```tsx title = 'client/trpc.ts'
// The client can then specify which HTTP method to use for all queries/mutations
const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: `http://localhost:3000`,
      methodOverride: 'POST', // all queries and mutations will be sent to the tRPC Server as POST requests.
    }),
  ],
});
```

## Dig deeper

You can read more details by drilling into the TypeScript definitions in

- [/packages/server/src/rpc/envelopes.ts](https://github.com/trpc/trpc/tree/next/packages/server/src/rpc/envelopes.ts)
- [/packages/server/src/rpc/codes.ts](https://github.com/trpc/trpc/tree/next/packages/server/src/rpc/codes.ts)
