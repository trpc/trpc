import {
  convertToModelMessages,
  generateText,
  isStepCount,
  readUIMessageStream,
  simulateReadableStream,
  streamText,
  tool,
  toUIMessageStream,
  type ChatTransport,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { call, initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../../packages/trpc/src/fixtures/server.ts';

type Usage = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>['usage'];
const usage: Usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 2, text: 2, reasoning: undefined },
};
const finish = { unified: 'stop', raw: 'stop' } as const;

const model = new MockLanguageModelV4({
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'Hello' },
        { type: 'text-delta', id: 't', delta: ', Ada' },
        { type: 'text-end', id: 't' },
        { type: 'finish', finishReason: finish, usage },
      ],
    }),
  }),
});

const t = initTrpc<{ ctx: { user: string } }>();

const WeatherInput = z.object({ city: z.string() });
const router = {
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
  weather: t.procedure.input(WeatherInput).query((opts) => ({
    city: opts.input.city,
    celsius: 21,
    for: opts.ctx.user,
  })),
};

test('a procedure streams an AI SDK UI message stream that useChat can read', async () => {
  await using server = await createTestServer({
    router,
    createContext: () => ({ user: 'ada' }),
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url })],
  });
  const transport: ChatTransport<UIMessage> = {
    sendMessages: (opts) =>
      client.chat.mutate(
        { chatId: opts.chatId, messages: opts.messages },
        { signal: opts.abortSignal },
      ),
    reconnectToStream: async () => null,
  };

  const stream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'c1',
    messageId: undefined,
    abortSignal: undefined,
    messages: [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
    ],
  });
  let last: UIMessage | undefined;
  for await (const message of readUIMessageStream({ stream })) last = message;
  expect(last?.role).toBe('assistant');
  expect(last?.parts).toContainEqual(
    expect.objectContaining({ type: 'text', text: 'Hello, Ada' }),
  );
  expect(model.doStreamCalls[0]?.prompt).toContainEqual(
    expect.objectContaining({ role: 'user' }),
  );
});

test('a procedure is an AI SDK tool through its input schema and call()', async () => {
  const weather = tool({
    description: 'The weather in a city',
    inputSchema: WeatherInput,
    execute: (input) => call(router.weather, input, { ctx: { user: 'ada' } }),
  });
  const agent = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'weather',
            input: JSON.stringify({ city: 'Oslo' }),
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage,
        warnings: [],
      },
      {
        content: [{ type: 'text', text: '21°C in Oslo' }],
        finishReason: finish,
        usage,
        warnings: [],
      },
    ],
  });
  const result = await generateText({
    model: agent,
    tools: { weather },
    prompt: 'Weather in Oslo?',
    stopWhen: isStepCount(2),
  });
  expect(result.text).toBe('21°C in Oslo');
  const output = result.steps[0]?.toolResults[0]?.output;
  expect(output).toEqual({ city: 'Oslo', celsius: 21, for: 'ada' });
  expectTypeOf(weather.execute).parameter(0).toEqualTypeOf<{ city: string }>();
});
