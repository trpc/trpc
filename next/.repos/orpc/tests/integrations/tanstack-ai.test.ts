import type { AnyTextAdapter, StreamChunk, TextOptions, UIMessage } from '@tanstack/ai'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { createORPCClient } from '@orpc/client'
import { openapi } from '@orpc/openapi'
import { OpenAPIHandler, OpenAPILink } from '@orpc/openapi/fetch'
import { os, type } from '@orpc/server'
import { isAsyncIteratorObject } from '@orpc/shared'
import { chat, EventType } from '@tanstack/ai'
import { fetchServerSentEvents } from '@tanstack/ai-client'

/**
 * Minimal TextAdapter that echoes the last user message, so the real `chat()`
 * engine runs without an API key. Docs examples use `openaiText` in its place.
 */
function mockText(): AnyTextAdapter {
  const adapter = {
    kind: 'text' as const,
    name: 'mock',
    model: 'mock-echo-1',
    async* chatStream(options: TextOptions<Record<string, any>>): AsyncIterable<StreamChunk> {
      const runId = options.runId ?? 'run_mock'
      const threadId = options.threadId ?? 'thread_mock'
      const messageId = 'msg_mock'

      yield { type: EventType.RUN_STARTED, runId, threadId, timestamp: Date.now() }
      yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant', timestamp: Date.now() }

      const lastUser = [...(options.messages ?? [])].reverse().find(m => m.role === 'user')
      const lastContent = typeof lastUser?.content === 'string'
        ? lastUser.content
        : JSON.stringify(lastUser?.content)

      for (const delta of ['echo: ', lastContent]) {
        yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta, timestamp: Date.now() }
      }

      yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: Date.now() }
      yield { type: EventType.RUN_FINISHED, runId, threadId, model: 'mock-echo-1', timestamp: Date.now(), finishReason: 'stop' }
    },
    structuredOutput: async (): Promise<never> => {
      throw new Error('mock adapter does not support structured output')
    },
  }

  return adapter as unknown as AnyTextAdapter
}

/** the docs example procedure, consumed both through the oRPC client and TanStack AI's built-in connections */
const router = {
  streamChat: os
    .meta(openapi({ method: 'POST', path: '/chat' }))
    .input(type<{ messages: UIMessage[] }>())
    .handler(({ input, signal }) => {
      const abortController = new AbortController()
      signal?.addEventListener('abort', () => abortController.abort(), { once: true })

      return chat({
        adapter: mockText(),
        messages: input.messages,
        abortController,
      })
    }),
}

const handler = new OpenAPIHandler(router)

const server = serve({
  fetch: async (request: Request) => {
    const { response } = await handler.handle(request, { prefix: '/api' })
    return response ?? new Response('Not Found', { status: 404 })
  },
  port: 0,
})

afterAll(() => {
  server.close()
})

const origin = `http://localhost:${(server.address() as AddressInfo).port}`

const link = new OpenAPILink(router as any, { url: '/api', origin })
const client: any = createORPCClient(link)

const userMessages: UIMessage[] = [
  { id: '1', role: 'user', parts: [{ type: 'text', content: 'ping' }] },
]

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

function collectText(chunks: StreamChunk[]): string {
  return chunks
    .filter(chunk => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
    .map(chunk => chunk.delta)
    .join('')
}

function expectChatStream(chunks: StreamChunk[]): void {
  expect(chunks.at(0)?.type).toBe(EventType.RUN_STARTED)
  expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  expect(collectText(chunks)).toContain('ping')
}

it('chat() returns an async iterator object, so procedures can return it directly', () => {
  const stream = chat({ adapter: mockText(), messages: userMessages })

  expect(isAsyncIteratorObject(stream)).toBe(true)
})

it('streams through the oRPC client as an async iterator object, compatible with useChat fetcher', async () => {
  const stream = await client.streamChat({ messages: userMessages })

  expect(isAsyncIteratorObject(stream)).toBe(true)
  expectChatStream(await collect(stream))
})

it('is consumable by tanstack ai\'s built-in fetchServerSentEvents connection', async () => {
  const connection = fetchServerSentEvents(`${origin}/api/chat`)

  expectChatStream(await collect(connection.connect(userMessages)))
})
