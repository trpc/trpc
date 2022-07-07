<p align="center">
  <a href="https://trpc.io/"><img src="../../www/static/img/logo-text.svg" alt="tRPC" height="130"/></a>
</p>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

> The `@trpc/client` package is responsible for creating a client that interacts and fetches data from a trpc server.

## Installation

```bash
# NPM
npm install @trpc/client

# Yarn
yarn add @trpc/client

# Pnpm
pnpm install @trpc/client
```

## Basic Example

```typescript
import { createTRPCClient } from '@trpc/client';
// Import the router type from the server
import type { AppRouter } from './server';

async function main() {
  const client = createTRPCClient<AppRouter>({
    url: 'http://localhost:2022' // The server url
  });

  const res = await client.query('hello', {
    name: 'world',
  });

  console.log('res', res);
}

main();
```

## Documentation

Full documentation for `@trpc/client` and other related packages is available [here](https://trpc.io/docs/vanilla)
