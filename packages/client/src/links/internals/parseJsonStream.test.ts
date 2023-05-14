import { parseJsonStream } from './parseJsonStream';

describe('parseJsonStream', () => {
  test('regular stringified JSON', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enqueue = (chunk: string) =>
          controller.enqueue(encoder.encode(chunk));
        enqueue(JSON.stringify([{ a: 1 }, { b: 2 }, { c: 3 }]) + '\n');
        controller.close();
      },
    });
    const iterator = parseJsonStream(stream);
    const data = await iterator.next();
    expect(data.value).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
    expect(data.done).toBe(true);
  });
  test('multiline streamed JSON', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enqueue = (chunk: string) =>
          controller.enqueue(encoder.encode(chunk));
        enqueue('{\n');
        enqueue(`"0":${JSON.stringify({ a: 1 })}\n`);
        enqueue(`,"2":${JSON.stringify({ c: 3 })}\n`);
        enqueue(`,"1":${JSON.stringify({ b: 2 })}\n`);
        enqueue('}');
        controller.close();
      },
    });
    const results: any[] = [];
    for await (const [index, body] of parseJsonStream(stream)) {
      results[index as unknown as number] = body;
    }
    expect(results).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });
});
