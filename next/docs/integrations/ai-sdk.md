---
title: AI SDK
description: Stream useChat responses from a procedure, and give procedures to the model as tools.
section: Integrations
order: 6
---

[AI SDK](https://ai-sdk.dev/) (v7) streams chat responses as a `ReadableStream` of UI message chunks. A procedure returns that stream as it is, and the client gets a `ReadableStream` back, which is what `useChat`'s transport returns. This needs no adapter package, and it's tested against the real library in `test/integration/`.

```ts
import {
  convertToModelMessages,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';

const router = {
  chat: t.procedure
    .input(
      z.object({
        chatId: z.string(),
        messages: z.array(z.custom<UIMessage>()),
      }),
    )
    .mutation(async ({ input, signal }) => {
      const result = streamText({
        model,
        messages: await convertToModelMessages(input.messages),
        abortSignal: signal,
      });
      return toUIMessageStream({ stream: result.stream });
    }),
};
```

```tsx
import { useChat } from '@ai-sdk/react';

const { messages, sendMessage, status } = useChat({
  transport: {
    sendMessages: ({ chatId, messages, abortSignal }) =>
      client.chat.mutate({ chatId, messages }, { signal: abortSignal }),
    reconnectToStream: async () => null,
  },
});
```

- The chunks stream as JSONL (or [binary frames](../server/files.md)) and arrive as plain objects, so AI SDK's `structuredClone` works on them.
- Stopping the chat aborts the call; `signal` reaches `streamText`, which stops the model.
- `reconnectToStream` returning `null` means "nothing to resume". For resumable chats, keep the stream behind a [`Publisher`](../subscriptions/publisher.md) channel and return a subscription to it.

## Procedures as tools

AI SDK takes Standard Schema as a tool's `inputSchema`, so a tool reuses the procedure's input schema and runs the procedure with [`call()`](../server/server-side-calls.md), middleware and validation included:

```ts
import { tool } from 'ai';
import { call } from '@trpc12/trpc/server';

const WeatherInput = z.object({ city: z.string() });
const weatherProcedure = t.procedure
  .input(WeatherInput)
  .query(({ input }) => forecast(input.city));

const weather = tool({
  description: 'The weather in a city',
  inputSchema: WeatherInput,
  execute: (input) => call(weatherProcedure, input, { ctx }),
});

await generateText({ model, tools: { weather }, prompt });
```
