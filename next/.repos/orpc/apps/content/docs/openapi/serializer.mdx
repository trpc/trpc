---
title: "OpenAPI Serializer"
description: "Learn how OpenAPI Serializer performs one-way serialization of complex types like Date, BigInt, and files into JSON-friendly formats, and how to customize it."
---

## Supported Data Types

`OpenAPISerializer` supports the following types by default:

| Type                             | Handler key | Serialized         | Notes                                |
| -------------------------------- | ----------- | ------------------ | ------------------------------------ |
| **string**                       |             |                    |                                      |
| **number**                       |             |                    |                                      |
| **NaN**                          | `nan`       | `null`             |                                      |
| **Infinity**, **-Infinity**      | `infinity`  | `null`             |                                      |
| **boolean**                      |             |                    |                                      |
| **null**                         |             |                    |                                      |
| **undefined**                    | `undefined` | `null`             | Ignore `undefined` properties        |
| **Date**                         | `date`      | ISO String, `null` |                                      |
| **BigInt**                       | `bigint`    | string             |                                      |
| **URL**                          | `url`       | string             |                                      |
| **Record (object)**              |             |                    | `toJSON` methods are ignored         |
| **Array**                        |             |                    |                                      |
| **Set**                          | `set`       | array              |                                      |
| **Map**                          | `map`       | array              |                                      |
| **Blob**                         |             |                    | Unsupported in `AsyncIteratorObject` |
| **File**                         |             |                    | Unsupported in `AsyncIteratorObject` |
| **AsyncIteratorObject**          |             |                    | Only at the root level               |
| **`ReadableStream<Uint8Array>`** |             |                    | Only at the root level               |

:::warning
To better support `Blob`, `File`, and `ReadableStream<Uint8Array>` at the root level in cross-origin scenarios,
extend your [CORS allowlist](https://developer.mozilla.org/en-US/docs/Glossary/CORS-safelisted_response_header) to allow clients to read the `Content-Disposition` and `Standard-Server` response headers. Learn more in the [Standard Server documentation](https://github.com/middleapi/standard-server#how-body-parsing-works). If you use the [CORS Plugin](/docs/plugins/cors), include them in `exposeHeaders`:

```ts
const cors = new CORSHandlerPlugin({
  exposeHeaders: ['Content-Disposition', 'Standard-Server'],
})
```

:::

## Limitations

OpenAPI Serializers are designed for one-way serialization to JSON-friendly formats. For example, a `Date` is serialized to an ISO string and remains a string after deserialization unless you add custom logic or plugins.

In complex cases like mixed files with other data or nested structures in query strings, OpenAPI Serializer might use bracket notation to represent nested data, which has its own limitations. See [Bracket Notation Limitations](/docs/openapi/bracket-notation#limitations) for details.

:::tip
If you use [OpenAPI Link](/docs/openapi/link) to connect your client and server, follow [Expanding Type Support for OpenAPI Link](/docs/openapi/expanding-type-support-for-link) to restore native types on the client.
:::

## Custom Serializers

Add custom handlers with unique keys to support additional types, or reuse a built-in key to override the default behavior.

```ts twoslash
class Person {
  constructor(
    public name: string,
    public age: number,
  ) {}
}
// ---cut---
import { OpenAPISerializer } from '@orpc/openapi'

const serializer = new OpenAPISerializer({
  handlers: {
    person: { // <- add support for Person
      condition: v => v instanceof Person,
      serialize: (v: Person) => ({ name: v.name, age: v.age }),
    },
    date: { // <- replace the default Date handler
      condition: v => v instanceof Date,
      serialize: (v: Date) => v.getTime(),
    },
  },
})
```

:::info[Use a custom serializer with OpenAPIHandler and OpenAPILink]

```ts
const handler = new OpenAPIHandler(router, {
  serializer,
})

const link = new OpenAPILink(contract, {
  serializer,
})
```

:::

## Serialization Format

In most cases, serialized data is JSON-serializable.

```json
{
  "name": "John",
  "age": 30,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### With Files

If the data includes nested `Blob` or `File`, the serializer returns a `FormData` object using [Bracket Notation](/docs/openapi/bracket-notation). Non-file values are converted to strings, and `null` or `undefined` fields are omitted.

```ts
const form = new FormData()

form.append('name', 'Earth')
form.append('thumbnail', new Blob([''], { type: 'image/png' }))
form.append('images[0]', new Blob([''], { type: 'image/png' }))
form.append('createdAt', '2022-01-01T00:00:00.000Z')
```

:::info
`images[0]` means the first item in `images` array.
:::

### Direct File

If the entire data is a single `Blob` or `File`, it can be sent as-is without wrapping in `FormData`.

```http
HTTP/1.1 200 OK
Content-Type: image/png
Content-Disposition: attachment; filename="earth.png"
Content-Length: 12345
Standard-Server: file

<binary data>
```

:::info
If the receiver mistakenly handles this payload as a regular (non-file) body, set the `standard-server` header to help the receiver detect the actual data type and handle it correctly. Learn more about this header in the [Standard Server Documentation](https://github.com/middleapi/standard-server#how-body-parsing-works).
:::

### AsyncIteratorObject

When the output is an `AsyncIteratorObject`, it is sent as a [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) stream. Each event contains one serialized chunk of data.

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"name":"John","createdAt":"2024-01-01T00:00:00.000Z"}

data: {"name":"Jane","createdAt":"2024-01-02T00:00:00.000Z"}
```

### `ReadableStream<Uint8Array>`

A `ReadableStream<Uint8Array>` is passed through as-is and streamed as binary data.

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Standard-Server: octet-stream

<binary chunk 1>
<binary chunk 2>
```

:::info
If the receiver mistakenly handles this payload as a regular (non-stream) body, set the `standard-server` header to help the receiver detect the actual data type and handle it correctly. Learn more about this header in the [Standard Server Documentation](https://github.com/middleapi/standard-server#how-body-parsing-works).
:::

## Learn More

The serializer is a small, self-contained module, making it easy to understand.
To explore its behavior in detail, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/openapi/src/openapi-serializer.ts).
