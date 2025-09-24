import '@testing-library/react';
import { aggregateAsyncIterable } from '@trpc/server/__tests__/aggregateAsyncIterable';
import { fetchServerResource } from '@trpc/server/__tests__/fetchServerResource';
import * as streamsPolyfill from 'web-streams-polyfill';
import { jsonlStreamConsumer, jsonlStreamProducer } from './jsonl';

test('regression: #6955', { repeats: 100 }, async () => {
  const data = {
    0: Promise.resolve(
      (async function* () {
        yield 1;
        yield 2;
        yield 3;
      })(),
    ),
  } as const;
  const stream = jsonlStreamProducer({
    data,
  });

  await using server = fetchServerResource(async () => {
    return new Response(stream);
  });

  const res = await fetch(server.url);

  const [head, meta] = await jsonlStreamConsumer<typeof data>({
    from: new streamsPolyfill.ReadableStream({
      async pull(controller) {
        for await (const chunk of res.body!) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
      cancel() {
        return res.body!.cancel();
      },
    }) as ReadableStream,
    abortController: new AbortController(),
    ponyfills: streamsPolyfill as any,
  });

  {
    expect(head[0]).toBeInstanceOf(Promise);

    const iterable = await head[0];

    const aggregated = await aggregateAsyncIterable(iterable);
    expect(aggregated.ok).toBe(true);
    expect(aggregated.items).toEqual([1, 2, 3]);
  }

  // await meta.reader.closed;
  expect(meta.isEmpty()).toBe(true);
});
