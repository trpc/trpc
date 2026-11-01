---
title: AI SDK
description: Stream `useChat` responses from a procedure, and give procedures to the model as tools.
section: Integrations
order: 3
experiment: integrations
---

[AI SDK](https://ai-sdk.dev/) (v7) streams chat responses as a `ReadableStream` of UI message chunks. A procedure returns that stream as it is, and the client gets a `ReadableStream` back, which is what `useChat`'s transport returns. This needs no adapter package, and it's tested against the real library in `test/integration/`.

```package-install
@trpc12/trpc effect ai @ai-sdk/react
```

```ts twoslash
// ---cut-start---
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { t } from './server.ts';
declare const model: LanguageModel;
// ---cut-end---
import {
  convertToModelMessages,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';

const router = t.router({
  chat: t.procedure
    .input(
      z.object({
        chatId: z.string(),
        messages: z.array(z.custom<UIMessage>()),
      }),
    )
    .mutation(async (opts) => {
      const result = streamText({
        model,
        messages: await convertToModelMessages(opts.input.messages),
        abortSignal: opts.signal,
      });
      return toUIMessageStream({ stream: result.stream });
    }),
});
```

```tsx
import { useChat } from '@ai-sdk/react';

const chat = useChat({
  transport: {
    sendMessages: (opts) =>
      client.chat.mutate(
        { chatId: opts.chatId, messages: opts.messages },
        { signal: opts.abortSignal },
      ),
    reconnectToStream: async () => null,
  },
});
```

- The chunks stream as JSONL (or [binary frames](../server/files.md)) and arrive as plain objects, so AI SDK's `structuredClone` works on them.
- Stopping the chat aborts the call; `signal` reaches `streamText`, which stops the model.
- `reconnectToStream` returning `null` means "nothing to resume". For resumable chats, keep the stream behind a [`experimental_Publisher`](../subscriptions/publisher.md) channel and return a subscription to it.

## Procedures as tools

AI SDK takes Standard Schema as a tool's `inputSchema`, so a tool reuses the procedure's input schema and runs the procedure with [`t.call()`](../server/server-side-calls.md), middleware and validation included:

```ts twoslash
// ---cut-start---
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { t, type Context } from './server.ts';
declare const model: LanguageModel;
declare const ctx: Context;
declare const prompt: string;
declare function forecast(city: string): Promise<string>;
// ---cut-end---
import { generateText, tool } from 'ai';

const WeatherInput = z.object({ city: z.string() });
const weatherProcedure = t.procedure
  .input(WeatherInput)
  .query((opts) => forecast(opts.input.city));

const weather = tool({
  description: 'The weather in a city',
  inputSchema: WeatherInput,
  execute: (input) => t.call(weatherProcedure, input, { ctx }),
});

await generateText({ model, tools: { weather }, prompt });
```

## Credits

This recipe follows [oRPC's AI SDK integration](https://orpc.dev/docs/integrations/ai-sdk).
