import { parseJSONStream } from './streamingHttpUtils';

describe('parseJsonStream', () => {
  test('multiline streamed JSON', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enqueue = (chunk: string) =>
          controller.enqueue(encoder.encode(chunk));
        enqueue(`{"0":${JSON.stringify({ a: 1 })}\n`);
        enqueue(`,"2":${JSON.stringify({ c: 3 })}\n`);
        enqueue(`,"1":${JSON.stringify({ b: 2 })}\n`);
        enqueue('}');
        controller.close();
      },
    });
    const orderReceived: any[] = [];
    const itemsArray: any[] = [];
    const fullData = await parseJSONStream({
      readableStream: stream,
      onSingle: (index, data) => {
        orderReceived.push(index);
        itemsArray[index] = data;
      },
    });
    expect(orderReceived).toEqual([0, 2, 1]);
    expect(itemsArray).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
    expect(fullData).toEqual(undefined);
  });
});
