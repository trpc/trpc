---
title: "OpenAPI Reference Plugin (Swagger/Scalar)"
description: "Serve interactive API reference documentation powered by Scalar or Swagger UI and expose your OpenAPI specification as JSON."
sidebar:
  label: "OpenAPI Reference"
---

:::info
This plugin depends on the [OpenAPI Generator](/docs/openapi/specification). Review that guide before setting up the reference plugin.
:::

## Setup

To use this plugin, first create an [OpenAPI Generator](/docs/openapi/specification). The plugin uses it to generate the OpenAPI specification.

```ts
import { OpenAPIGenerator } from '@orpc/openapi'
import { OpenAPIReferenceHandlerPlugin } from '@orpc/openapi/plugins'

const generator = new OpenAPIGenerator({
  converters: [
    new ZodToJsonSchemaConverter(),
  ],
})

const handler = new OpenAPIHandler(router, {
  plugins: [
    new OpenAPIReferenceHandlerPlugin({
      spec: () => generator.generate(router, {
        base: {
          info: {
            title: 'ORPC Playground',
            version: '1.0.0',
          },
          servers: [
            { url: 'https://api.example.com/v1', },
          ],
        },
      }),
    }),
  ]
})
```

:::info
By default, the API reference UI is served from `/`, and the OpenAPI specification is served from `/spec.json`. Use `docsPath` and `specPath` to change these routes.
:::

## Provider

[Scalar](https://github.com/scalar/scalar) is the default provider. To use [Swagger UI](https://swagger.io/tools/swagger-ui/) instead, set `provider` to `'swagger'`. Use `providerConfig` to pass provider-specific options.

```ts
const handler = new OpenAPIHandler(router, {
  plugins: [
    new OpenAPIReferenceHandlerPlugin({
      provider: 'swagger',
      providerConfig: {
        // Swagger UI specific configuration
      },
    }),
  ]
})
```

:::tip
To make `providerConfig` typesafe, install the type definitions for your chosen provider:

<CodeGroup>

```sh scalar
npm install @scalar/api-reference
```

```sh swagger
npm install swagger-ui @types/swagger-ui
```

</CodeGroup>
:::

:::info
You can also load custom assets for the docs UI by setting `providerScriptUrl` and `providerCssUrl`.
:::

### Swagger Presets and Plugins

With Swagger UI, `presets` and `plugins` are paths to global variables, resolved in the browser when the page loads. To use your own, load them through `docsHead` and reference them by name:

```ts
new OpenAPIReferenceHandlerPlugin({
  provider: 'swagger',
  docsHead: '<script src="https://unpkg.com/swagger-ui-dist/swagger-ui-standalone-preset.js"></script>',
  providerConfig: {
    presets: ['SwaggerUIBundle.presets.apis', 'SwaggerUIStandalonePreset'],
    plugins: ['SwaggerUIBundle.plugins.DownloadUrl'],
    layout: 'StandaloneLayout',
  },
})
```

## Restricting Access

By default, the docs UI and OpenAPI specification are publicly accessible. Use `allow` to serve them conditionally. When it resolves to `false`, the request falls through as unmatched, as if the plugin were not installed.

```ts
const handler = new OpenAPIHandler(router, {
  plugins: [
    new OpenAPIReferenceHandlerPlugin({
      spec: () => generator.generate(router),
      allow: async ({ context }) => context.user !== undefined,
    }),
  ]
})
```

## Learn More

For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/openapi/src/plugins/openapi-reference.ts).
