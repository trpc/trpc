---
title: "AI SDK Integration"
description: "Learn how to use oRPC as a transport for AI SDK streams and turn oRPC procedures and contracts into AI SDK tools."
sidebar:
  label: "AI SDK"
---

:::warning
This documentation requires AI SDK v7.0.0 or later. For a refresher, review the [AI SDK documentation](https://ai-sdk.dev/docs).
:::

## Transport

Use oRPC as the transport for AI SDK streams, sending them as either an [AsyncIteratorObject](/docs/async-iterator-object) or a [`ReadableStream<Uint8Array>`](/docs/binary-data#readablestreamuint8array). The examples below use the `AsyncIteratorObject` approach.

### Server

Use `streamToAsyncIteratorObject` to convert AI SDK streams into [AsyncIteratorObject](/docs/async-iterator-object)s.

```ts
import { os, streamToAsyncIteratorObject, type } from '@orpc/server'
import { convertToModelMessages, streamText, toUIMessageStream, UIMessage } from 'ai'
import { google } from '@ai-sdk/google'

export const chat = os
  .input(type<{ chatId: string, messages: UIMessage[] }>())
  .handler(async ({ input }) => {
    const result = streamText({
      model: google('gemini-2.5-flash'),
      system: 'You are a helpful assistant.',
      messages: await convertToModelMessages(input.messages),
    })

    return streamToAsyncIteratorObject(
      toUIMessageStream(result),
    )
  })
```

### Client

On the client side, convert the `AsyncIteratorObject` back to a stream using `asyncIteratorToUnproxiedDataStream` or `asyncIteratorToStream`.

```tsx
import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { asyncIteratorToUnproxiedDataStream } from '@orpc/client'
import { client } from './client'

export function Example() {
  const { messages, sendMessage, status } = useChat({
    transport: {
      async sendMessages(options) {
        return asyncIteratorToUnproxiedDataStream(await client.chat({
          chatId: options.chatId,
          messages: options.messages,
        }, { signal: options.abortSignal }))
      },
      reconnectToStream(options) {
        throw new Error('Unsupported')
      },
    },
  })
  const [input, setInput] = useState('')

  return (
    <>
      {messages.map(message => (
        <div key={message.id}>
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) =>
            part.type === 'text' ? <span key={index}>{part.text}</span> : null,
          )}
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim()) {
            sendMessage({ text: input })
            setInput('')
          }
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={status !== 'ready'}
          placeholder="Say something..."
        />
        <button type="submit" disabled={status !== 'ready'}>
          Submit
        </button>
      </form>
    </>
  )
}
```

:::info
The `reconnectToStream` function is not supported by default, which is fine for most use cases. If you need reconnection support, implement it similar to `sendMessages` with custom reconnection logic.
:::

:::info
Prefer `asyncIteratorToUnproxiedDataStream` over `asyncIteratorToStream`.
AI SDK internally uses `structuredClone`, which doesn't support proxied data.
oRPC may proxy events for [metadata](/docs/client/async-iterator-object#event-metadata), so unproxy before passing to AI SDK.
:::

## Tool Implementer

Implements a [procedure contract](/docs/contract/procedure) as an [AI SDK Tool](https://ai-sdk.dev/docs/foundations/tools) by leveraging existing contract definitions.

```ts
import { aiSdkTool, implementToolFactory } from '@orpc/ai-sdk'

const getWeatherContract = oc
  .meta(aiSdkTool({ // Base AI SDK tool options
    description: 'Get the weather in a location',
    metadata: { source: 'weather-service' }
  }))
  .input(z.object({
    location: z.string().describe('The location to get the weather for'),
  }))
  .output(z.object({
    location: z.string().describe('The location the weather is for'),
    temperature: z.number().describe('The temperature in Celsius'),
  }))

const implementTool = implementToolFactory()

const getWeatherTool = implementTool(getWeatherContract, {
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
  // ...add any additional AI SDK tool options or overrides here
})
```

:::info
Standard [procedures](/docs/procedure) are also compatible with [procedure contracts](/docs/contract/procedure).
:::

:::info
The `aiSdkTool` [metadata](/docs/metadata) attaches base AI SDK tool options that every tool created from the procedure/contract inherits. If applied multiple times, later calls override matching keys from earlier ones.
:::

## Tool Factory

Converts a [procedure](/docs/procedure) into an [AI SDK Tool](https://ai-sdk.dev/docs/foundations/tools) by leveraging existing procedure definitions.

```ts
import { aiSdkTool, createToolFactory } from '@orpc/ai-sdk'
import { os } from '@orpc/server'
import { z } from 'zod'

const getWeatherProcedure = os
  .meta(aiSdkTool({ // Base AI SDK tool options
    description: 'Get the weather in a location',
    metadata: { source: 'weather-service' }
  }))
  .input(z.object({
    location: z.string().describe('The location to get the weather for'),
  }))
  .output(z.object({
    location: z.string().describe('The location the weather is for'),
    temperature: z.number().describe('The temperature in Celsius'),
  }))
  .handler(async ({ input }) => ({
    location: input.location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }))

const createTool = createToolFactory({
  context: {}, // provide initial context if needed
  interceptors: [], // oRPC interceptors if needed
})

const getWeatherTool = createTool(getWeatherProcedure, {
  // ...add any additional AI SDK tool options or overrides here
})
```

### Streaming Tool Outputs

When a procedure outputs an [AsyncIteratorObject](/docs/async-iterator-object), either validated with `asyncIteratorObject` or produced by an `async function*` handler, the resulting tool streams every event as a [preliminary tool result](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#preliminary-tool-results): each event replaces the tool output in the UI, and the last event becomes the final tool result sent to the model.

```ts
import { asyncIteratorObject, os } from '@orpc/server'

const deployProcedure = os
  .input(z.object({ app: z.string() }))
  .output(asyncIteratorObject(
    z.object({
      status: z.string(),
      url: z.string().optional().describe('Available once the deploy finishes'),
    }),
  ))
  .handler(async function* ({ input }) {
    yield { status: 'building' }
    yield { status: 'uploading' }
    yield { status: 'ready', url: `https://${input.app}.example.com` }
  })

const deployTool = createTool(deployProcedure)
```
