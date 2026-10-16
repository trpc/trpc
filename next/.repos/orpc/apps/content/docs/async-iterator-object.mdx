---
title: "AsyncIteratorObject (SSE)"
description: "Stream realtime typesafe data from oRPC procedures with async generators, event validation, resume support, and cleanup on disconnect."
---

## Overview

An `AsyncIteratorObject` is implemented as an [asynchronous generator function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function*) (or a compatible implementation). In the example below, the handler emits a new event every second:

```ts
const example = os
  .handler(async function* ({ input, signal, lastEventId }) {
    while (true) {
      signal?.throwIfAborted()
      yield { message: 'Hello, world!' }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  })
```

:::info
Learn how to consume an `AsyncIteratorObject` from the client in the [client guide](/docs/client/async-iterator-object).
:::

## Validating Events

Use the built‑in `asyncIteratorObject` schema that works with any [Standard Schema](https://standardschema.dev/schema#what-schema-libraries-implement-the-spec) library to validate events.

```ts
import { asyncIteratorObject } from '@orpc/server'

const example = os
  .output(asyncIteratorObject(z.object({ message: z.string() })))
  .handler(async function* ({ input, signal, lastEventId }) {
    while (true) {
      signal?.throwIfAborted()
      yield { message: 'Hello, world!' }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  })
```

## Last Event ID & Event Metadata

Using the `withEventMeta` helper, you can attach [additional event metadata](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format) (such as an event ID or retry interval) to each event. When the client reconnects properly, the last received event ID is sent back to the server in `lastEventId`, allowing the stream to resume from where it left off.

:::info
When used with the [Retry Plugin](/docs/plugins/retry) or [EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource), reconnection with the last event ID is handled automatically.
:::

```ts
import { withEventMeta } from '@orpc/server'

const example = os
  .handler(async function* ({ input, signal, lastEventId }) {
    if (lastEventId) {
      // Resume streaming from lastEventId
    }
    else {
      while (true) {
        signal?.throwIfAborted()
        yield withEventMeta(
          { message: 'Hello, world!' },
          { id: 'some-id', retry: 10_000 }
        )
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  })
```

## Stop AsyncIteratorObject

To end the stream, use either a `return` or `throw` statement. oRPC marks the stream as completed when the handler returns.

:::warning
This behavior is specific to oRPC. Standard [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) clients, such as [EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource), do not recognize this completion signal and will automatically attempt to reconnect. For details, see the [Standard Server documentation](https://github.com/middleapi/standard-server#event-stream-body).
:::

```ts
const example = os
  .handler(async function* ({ input, signal, lastEventId }) {
    while (true) {
      signal?.throwIfAborted()

      if (done) {
        return
      }

      yield { message: 'Hello, world!' }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  })
```

## Signal and Side-Effects

When the client closes the connection or an unexpected error occurs, oRPC aborts the provided `signal`. Use it to exit loops and avoid resource leaks. Put cleanup logic in a `finally` block so it runs whether the stream ends normally, errors, or is cancelled.

```ts
const example = os
  .handler(async function* ({ input, signal, lastEventId }) {
    try {
      while (true) {
        signal?.throwIfAborted()
        yield { message: 'Hello, world!' }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    finally {
      console.log('Cleanup logic here')
    }
  })
```

## Publisher Helper

You can combine the [AsyncIteratorObject](/docs/async-iterator-object) with the [Publisher Helper](/docs/helpers/publisher) to build real-time features like chat, notifications, or live updates with resume support.

```ts
const publisher = new MemoryPublisher<{
  'something-updated': {
    id: string
  }
}>()

const live = os
  .handler(async function* ({ input, signal, lastEventId }) {
    const iterator = publisher.subscribe('something-updated', { signal, lastEventId })
    for await (const payload of iterator) {
      // Handle payload here or yield directly to client
      yield payload
    }
  })

const publish = os
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    await publisher.publish('something-updated', { id: input.id })
  })
```
