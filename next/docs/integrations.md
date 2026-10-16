# Integrations

Recipes for libraries that need no adapter package: each one uses the library's own API with a plain procedure. They are tested against the real libraries in `test/integration/`.

## AI SDK

[AI SDK](https://ai-sdk.dev/) (v7) streams chat responses as a `ReadableStream` of UI message chunks. A procedure returns that stream as it is, and the client gets a `ReadableStream` back, which is what `useChat`'s transport returns:

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

- The chunks stream as JSONL (or [binary frames](./procedures.md#files)) and arrive as plain objects, so AI SDK's `structuredClone` works on them.
- Stopping the chat aborts the call; `signal` reaches `streamText`, which stops the model.
- `reconnectToStream` returning `null` means "nothing to resume". For resumable chats, keep the stream behind a [`Publisher`](./subscriptions.md#publisher) channel and return a subscription to it.

### Procedures as tools

AI SDK takes Standard Schema as a tool's `inputSchema`, so a tool reuses the procedure's input schema and runs the procedure with [`call()`](./procedures.md#calling-procedures-on-the-server), middleware and validation included:

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

## Better Auth

[Better Auth](https://better-auth.com/) reads the session from the request's headers. Put the headers in the ctx, then a middleware turns the session into `ctx.user`:

```ts
const t = initTrpc<{ ctx: { headers: Headers } }>();

const authed = t.procedure.use(async ({ ctx, next }) => {
  const session = await auth.api.getSession({ headers: ctx.headers });
  return session
    ? next({ ctx: { user: session.user, session: session.session } })
    : error({ code: 'UNAUTHORIZED' });
});

const router = {
  me: authed.query(({ ctx }) => ctx.user.name), // ctx.user is Better Auth's user type
};

createFetchHandler({
  router,
  createContext: ({ request }) => ({
    headers: new Headers(request.headers as Record<string, string>),
  }),
});
```

- Same-origin browsers send Better Auth's session cookie with each call. From another origin, set `httpLink({ init: () => ({ credentials: 'include' }) })` and allow credentials in [CORS](./platforms.md#middleware-and-cors).
- Over WebSockets, `createContext` gets the upgrade request's headers, so the cookie works there too.
- Better Auth's own routes (`/api/auth/*`) stay on `auth.handler`; serve them next to the tRPC endpoint.
