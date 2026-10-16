---
title: "TanStack AI Integration"
description: "Learn how to use oRPC as a transport for TanStack AI chat streams, through the oRPC client or as a plain Server-Sent Events endpoint."
sidebar:
  label: "TanStack AI"
---

:::warning
This documentation is based on TanStack AI v0.x, which is still evolving. For a refresher, review the [TanStack AI documentation](https://tanstack.com/ai/latest).
:::

## Transport

TanStack AI's `chat` returns an [AsyncIteratorObject](/docs/async-iterator-object) of stream chunks, so a procedure can return it directly and oRPC streams every chunk to the client.

### Server

```ts
import type { UIMessage } from '@tanstack/ai'
import { os, type } from '@orpc/server'
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export const streamChat = os
  .input(type<{ messages: UIMessage[] }>())
  .handler(({ input, signal }) => {
    const abortController = new AbortController()
    signal?.addEventListener('abort', () => abortController.abort(), { once: true })

    return chat({
      adapter: openaiText('gpt-5.5'),
      systemPrompts: ['You are a helpful assistant.'],
      messages: input.messages,
      abortController,
    })
  })
```

### Client

Pass an oRPC client call as the `fetcher` of `useChat`. The `fetcher` option accepts a promise of an `AsyncIterable` of stream chunks, which is exactly what an oRPC client call returns.

```tsx
import { useState } from 'react'
import { useChat } from '@tanstack/ai-react'
import { client } from './client'

export function Example() {
  const { messages, sendMessage, isLoading } = useChat({
    fetcher: ({ messages }, { signal }) =>
      client.streamChat({ messages }, { signal }),
  })
  const [input, setInput] = useState('')

  return (
    <>
      {messages.map(message => (
        <div key={message.id}>
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) =>
            part.type === 'text' ? <span key={index}>{part.content}</span> : null,
          )}
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim() && !isLoading) {
            sendMessage(input)
            setInput('')
          }
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isLoading}
          placeholder="Say something..."
        />
        <button type="submit" disabled={isLoading}>
          Submit
        </button>
      </form>
    </>
  )
}
```

:::tip
With [OpenAPIHandler](/docs/openapi/handler), TanStack AI's built-in `fetchServerSentEvents` connection can talk to a [routed](/docs/openapi/routing) procedure directly, no custom fetcher needed: oRPC streams [event iterators](/docs/async-iterator-object) as standard [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

```ts
export const streamChat = os
  .meta(openapi({ method: 'POST', path: '/chat' }))
  .input(type<{ messages: UIMessage[] }>())
  .handler(({ input }) => chat({
    adapter: openaiText('gpt-5.5'),
    messages: input.messages,
  }))

const { messages, sendMessage, isLoading } = useChat({
  connection: fetchServerSentEvents('/api/chat'), // handler prefix + route path
})
```

:::
