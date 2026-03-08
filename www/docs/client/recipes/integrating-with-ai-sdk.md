---
title: Integrating with AI SDK
sidebar_label: Integrating with AI SDK
---

When using the AI SDK, tRPC is a good fit for typed tool calls and chat/session orchestration. A common pattern is:

1. Call a tRPC procedure from your UI.
2. Start model generation in that procedure.
3. Return a stream or chunked payload back to the client.

This gives you one typed boundary for:

- chat input validation
- model/provider selection
- persistence and audit logging
- stream lifecycle controls (start/stop/resume)

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

declare function streamText(options: {
  model: string;
  prompt: string;
}): AsyncIterable<string>;

const t = initTRPC.create();

export const appRouter = t.router({
  ai: t.router({
    stream: t.procedure
      .input(z.object({ prompt: z.string() }))
      .query(async function* ({ input }) {
        for await (const token of streamText({
          model: 'gpt-4o-mini',
          prompt: input.prompt,
        })) {
          yield token;
        }
      }),
  }),
});
```

## Practical architecture

In production, most teams split this into three layers:

1. **Router/procedure layer** for validation, authz, and high-level orchestration
2. **AI service layer** for provider calls and tool wiring
3. **Persistence/stream state layer** for resumability and history

The procedure should stay thin: validate input, call service layer, return stream/chunks.

## Streaming design tips

- Prefer explicit chunk event shapes (`start`, `delta`, `finish`, `error`) for better UI state management.
- Keep stream cancellation explicit (client abort + server abort signal).
- Persist enough metadata to recover from refreshes or temporary disconnects.
- Add per-request IDs for tracing across UI, API, and model logs.

## Why the Chris Cook example is useful

The referenced example demonstrates a robust pattern with TanStack React Query where:

- optimistic UI state is applied immediately
- stream chunks progressively update cached messages
- resume/stop semantics are implemented explicitly

Reference implementation by Chris Cook:

- [ai-sdk-trpc-react-query example](https://github.com/zirkelc/resumable-streaming-examples/tree/main/examples/ai-sdk-trpc-react-query)

## Related docs

- [HTTP Batch Stream Link](../links/httpBatchStreamLink.md)
- [Server subscriptions](../../server/subscriptions.md)
