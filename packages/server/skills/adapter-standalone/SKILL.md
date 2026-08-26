---
name: adapter-standalone
description: >
  Mount tRPC on Node.js built-in HTTP server with createHTTPServer() from
  @trpc/server/adapters/standalone, createHTTPHandler() for custom http.createServer,
  createHTTP2Handler() for HTTP/2 with TLS. Configure basePath to slice URL prefix,
  CORS via the cors npm package passed as middleware option. CreateHTTPContextOptions
  provides req and res for context creation.
type: core
library: trpc
library_version: '11.14.0'
requires:
  - server-setup
sources:
  - www/docs/server/adapters/standalone.md
  - examples/standalone-server/src/server.ts
---

# tRPC — Adapter: Standalone

## Setup

```ts
// server.ts
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';

const t = initTRPC.create();

const appRouter = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => ({ greeting: `Hello, ${input.name}!` })),
});

export type AppRouter = typeof appRouter;

createHTTPServer({
  router: appRouter,
  createContext() {
    return {};
  },
}).listen(3000);

console.log('Listening on http://localhost:3000');
```

## Core Patterns

### CORS with the cors package

```ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import { createContext } from './context';
import { appRouter } from './router';

createHTTPServer({
  middleware: cors({ origin: 'http://localhost:5173' }),
  router: appRouter,
  createContext,
}).listen(3000);
```

Install CORS support: `npm install cors @types/cors`

### Custom HTTP server with createHTTPHandler

```ts
import { createServer } from 'http';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';

const handler = createHTTPHandler({
  router: appRouter,
  createContext() {
    return {};
  },
});

createServer((req, res) => {
  if (req.url?.startsWith('/health')) {
    res.writeHead(200);
    res.end('OK');
    return;
  }
  handler(req, res);
}).listen(3000);
```

### basePath for URL prefix stripping

```ts
import { createServer } from 'http';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';

const handler = createHTTPHandler({
  router: appRouter,
  basePath: '/trpc/',
});

createServer((req, res) => {
  if (req.url?.startsWith('/trpc/')) {
    return handler(req, res);
  }
  res.statusCode = 404;
  res.end('Not Found');
}).listen(3000);
```

The `basePath` option strips the prefix before routing, so `/trpc/greet` resolves to the `greet` procedure.

### HTTP/2 with createHTTP2Handler

```ts
import http2 from 'http2';
import { readFileSync } from 'node:fs';
import { createHTTP2Handler } from '@trpc/server/adapters/standalone';
import type { CreateHTTP2ContextOptions } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';

const tlsKey = readFileSync('./certs/server.key');
const tlsCert = readFileSync('./certs/server.crt');

async function createContext(opts: CreateHTTP2ContextOptions) {
  return {};
}

const handler = createHTTP2Handler({
  router: appRouter,
  createContext,
});

const server = http2.createSecureServer(
  { key: tlsKey, cert: tlsCert },
  (req, res) => {
    handler(req, res);
  },
);

server.listen(3001);
```

## Common Mistakes

### HIGH No CORS configuration for cross-origin requests

Wrong:

```ts
createHTTPServer({
  router: appRouter,
  createContext() {
    return {};
  },
}).listen(3000);
```

Correct:

```ts
import cors from 'cors';

createHTTPServer({
  middleware: cors({ origin: 'http://localhost:5173' }),
  router: appRouter,
  createContext() {
    return {};
  },
}).listen(3000);
```

The standalone adapter has no CORS handling by default. Cross-origin browser requests fail silently because preflight OPTIONS requests receive no CORS headers.

Source: www/docs/server/adapters/standalone.md

## See Also

- **server-setup** -- `initTRPC.create()`, router/procedure definition, context
- **adapter-express** -- alternative adapter when you need Express middleware ecosystem
- **adapter-fetch** -- alternative adapter for edge/serverless runtimes
- **subscriptions** -- adding real-time subscriptions to a standalone server
