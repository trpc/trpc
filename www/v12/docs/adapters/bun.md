---
title: Bun
description: "`Bun.serve` takes `handler.fetch`; WebSockets run on Effect's Bun server."
section: Adapters
order: 3
---

```ts twoslash
// ---cut-start---
/// <reference types="bun" />
import { handler } from './server.ts';
// ---cut-end---
Bun.serve({ port: 3000, fetch: handler.fetch });
```

Bun's server WebSockets aren't web-standard `WebSocket`s, so for WebSockets run `serve(handler)` on `BunHttpServer.layer` from `@effect/platform-bun`:

```ts twoslash
// ---cut-start---
import { handler } from './server.ts';
// ---cut-end---
import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Layer } from 'effect';
import { serve } from '@trpc12/trpc/http';

serve(handler).pipe(
  Layer.provide(BunHttpServer.layer({ port: 3000 })),
  Layer.launch,
  BunRuntime.runMain,
);
```

CI runs a suite on Bun this way (`pnpm test:bun`): batched queries, files, SSE with resume, `wsLink`, and aborting on disconnect.
