---
title: "RPC Protocol"
description: "Learn how the RPC protocol routes procedure calls, encodes input and output beyond plain JSON, and formats success and error responses."
---

The RPC protocol is a lightweight protocol for remote procedure calls, used by [RPC Handler](/docs/rpc/handler) and [RPC Link](/docs/rpc/link).

## Serializer

Most of the protocol's flexibility comes from its serializer. In addition to JSON-compatible values, it supports native types such as `Date`, `BigInt`, `URL`, `Set`, `Map`, `Blob`, `File`, `AsyncIteratorObject`, and `ReadableStream<Uint8Array>`. To learn more, including how to extend it, see [RPC Serializer](/docs/rpc/serializer).

:::warning
To better support `Blob`, `File`, and `ReadableStream<Uint8Array>` at the root level in cross-origin scenarios,
extend your [CORS allowlist](https://developer.mozilla.org/en-US/docs/Glossary/CORS-safelisted_response_header) to allow clients to read the `Content-Disposition` and `Standard-Server` response headers. Learn more in the [Standard Server documentation](https://github.com/middleapi/standard-server#how-body-parsing-works). If you use the [CORS Plugin](/docs/plugins/cors), include them in `exposeHeaders`:

```ts
const cors = new CORSHandlerPlugin({
  exposeHeaders: ['Content-Disposition', 'Standard-Server'],
})
```

:::

## Routing

The request `pathname` identifies which procedure to call.

```bash
curl https://example.com/rpc/planet/create
```

This calls the `planet.create` procedure when `/rpc` is the prefix:

```ts
const router = {
  planet: {
    create: os.handler(() => {}) // [!code highlight]
  }
}
```

## Sending Input

Requests can use the `POST`, `PUT`, `PATCH`, or `DELETE` method, or other methods like `GET` and `QUERY` when the server [allows them](/docs/rpc/handler#supported-http-methods). Send input in the query string (`GET`) or request body (other methods).

:::info
Request payloads depend on the serializer and are not plain JSON. Learn more in [RPC Serializer Format](/docs/rpc/serializer#serialization-format).
:::

### Query String

```ts
const url = new URL('https://example.com/rpc/planet/create')

url.searchParams.append('data', JSON.stringify({
  json: {
    name: 'Earth',
    detached_at: '2022-01-01T00:00:00.000Z'
  },
  meta: [['date', 'detached_at']]
}))

const response = await fetch(url)
```

### Request Body

```bash
curl -X POST https://example.com/rpc/planet/create \
  -H 'Content-Type: application/json' \
  -d '{
    "json": {
      "name": "Earth",
      "detached_at": "2022-01-01T00:00:00.000Z"
    },
    "meta": [["date", "detached_at"]]
  }'
```

### With Files

```ts
const form = new FormData()

form.set('data', JSON.stringify({
  json: {
    name: 'Earth',
    thumbnail: {},
    images: [{}],
  },
  maps: [['thumbnail'], ['images', 0]]
}))

form.set('0', new Blob([''], { type: 'image/png' }))
form.set('1', new Blob([''], { type: 'image/png' }))

const response = await fetch('https://example.com/rpc/planet/create', {
  method: 'POST',
  body: form
})
```

## Success Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "json": {
    "id": "1",
    "name": "Earth",
    "detached_at": "2022-01-01T00:00:00.000Z"
  },
  "meta": [["bigint", "id"], ["date", "detached_at"]]
}
```

A successful response should use an HTTP status code in the `2xx` range (must be less than `400`) and return the procedure output.

:::info
Response bodies depend on the serializer and are not plain JSON. Learn more in [RPC Serializer Format](/docs/rpc/serializer#serialization-format).
:::

## Error Response

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "json": {
    "defined": false,
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Internal server error",
    "data": {
      "id": "1234567890"
    }
  },
  "meta": [["bigint", "data", "id"]]
}
```

An error response should use an HTTP status code in the `4xx` or `5xx` range (must be greater than or equal to `400`) and return an [ORPCError](/docs/error-handling#orpcerror-class) object.

:::info
Response bodies depend on the serializer and are not plain JSON. Learn more in [RPC Serializer Format](/docs/rpc/serializer#serialization-format).
:::
