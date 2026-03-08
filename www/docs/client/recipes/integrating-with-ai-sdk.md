---
title: Integrating with AI SDK
sidebar_label: Integrating with AI SDK
---

When using the AI SDK, tRPC is a good fit for typed tool calls and chat/session orchestration. A common pattern is:

1. Call a tRPC procedure from your UI.
2. Start model generation in that procedure.
3. Return a stream or chunked payload back to the client.

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

Reference implementation by Chris Cook:

- [ai-sdk-trpc-react-query example](https://github.com/zirkelc/resumable-streaming-examples/tree/main/examples/ai-sdk-trpc-react-query)
