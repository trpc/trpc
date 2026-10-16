---
title: "Scalar (Swagger)"
description: "Use Scalar to serve an interactive API reference UI for your oRPC API generated from its OpenAPI specification."
---

:::info
This guide shows a manual setup. If you want a simpler option, use the [OpenAPI Reference Plugin](/docs/plugins/openapi-reference), which serves both the API reference UI and the OpenAPI specification for you.
:::

## Basic Example

This example serves the [OpenAPI specification](/docs/openapi/specification) document at `/spec.json` and renders Scalar at `/`.

```ts
import { createServer } from 'node:http'
import { OpenAPIGenerator } from '@orpc/openapi'
import { OpenAPIHandler } from '@orpc/openapi/node'
import { CORSHandlerPlugin } from '@orpc/server/plugins'
import { ZodToJsonSchemaConverter } from '@orpc/zod'

const openAPIHandler = new OpenAPIHandler(router, {
  plugins: [
    new CORSHandlerPlugin(),
  ],
})

const openAPIGenerator = new OpenAPIGenerator({
  converters: [
    new ZodToJsonSchemaConverter(),
  ],
})

const server = createServer(async (req, res) => {
  const { matched } = await openAPIHandler.handle(req, res, {
    prefix: '/api',
  })

  if (matched) {
    return
  }

  if (req.url === '/spec.json') {
    const spec = await openAPIGenerator.generate(router, {
      base: {
        info: {
          title: 'My Playground',
          version: '1.0.0',
        },
        servers: [
          { url: '/api' }, /** Use an absolute URL in production. */
        ],
        security: [{ bearerAuth: [] }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
            },
          },
        },
      },
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(spec))
    return
  }

  const html = `
    <!doctype html>
    <html>
      <head>
        <title>My Client</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="https://orpc.dev/icon.svg" />
      </head>
      <body>
        <div id="app"></div>

        <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
        <script>
          Scalar.createApiReference('#app', {
            url: '/spec.json',
            authentication: {
              securitySchemes: {
                bearerAuth: {
                  token: 'default-token',
                },
              },
            },
          })
        </script>
      </body>
    </html>
  `

  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(html)
})

server.listen(3000, () => {
  console.log('Playground is available at http://localhost:3000')
})
```

Open `http://localhost:3000` to view the API reference UI.
