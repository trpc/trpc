# OpenAPI schema generation for tRPC

The `@trpc/openapi` package generates an OpenAPI 3.1 specification from your tRPC router. Use the spec to:

- Generate a typed API client in any language
- Call tRPC endpoints via HTTP tools like Postman or Insomnia
- Enable AI agent integrations which can consume OpenAPI

## Install

```bash
pnpm add @trpc/openapi
```

## Quick start

### CLI

```bash
pnpm exec trpc-openapi ./src/server/router.ts
```

### Programmatic

```ts
import { generateOpenAPIDocument } from '@trpc/openapi';

const doc = generateOpenAPIDocument('./src/server/router.ts', {
  exportName: 'AppRouter',
  title: 'My API',
  version: '1.0.0',
});
```

The generator statically analyses your router's TypeScript types — it never executes your code.

## Documentation

Full documentation is available at [trpc.io/docs/openapi](https://trpc.io/docs/openapi).

## TODO

- [ ] SSE subscriptions
- [ ] non-json content types (might already work, needs tests)
- [ ] Improved handling of recursive/self-referencing types like trees/graphs - may be limited to 20 depth currently
- [ ] non-nodejs example
- [ ] an ai/mcp example

## Maybes

- [ ] workaround for needing transformers even cross-ecosystem (some options documented)
- [ ] REST translation layer without TrpcEnvelope and with alternative search params formats for get
