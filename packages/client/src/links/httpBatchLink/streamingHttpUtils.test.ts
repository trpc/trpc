import { parseJsonStream } from './streamingHttpUtils';

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
    let fullData: any;
    const itemsArray: any[] = [];
    let promiseResolution: () => void;
    const promise = new Promise<void>(
      (resolve) => (promiseResolution = resolve),
    );
    parseJsonStream(
      stream,
      (data) => {
        fullData = data;
        promiseResolution();
      },
      (index, data) => (itemsArray[index] = data),
      () => promiseResolution(),
    );
    await promise;
    expect(itemsArray).toEqual([]);
    expect(fullData).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
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
    let fullData: any;
    const itemsArray: any[] = [];
    let promiseResolution: () => void;
    const promise = new Promise<void>(
      (resolve) => (promiseResolution = resolve),
    );
    parseJsonStream(
      stream,
      (data) => {
        fullData = data;
        promiseResolution();
      },
      (index, data) => (itemsArray[index] = data),
      () => promiseResolution(),
    );
    await promise;
    expect(itemsArray).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
    expect(fullData).toEqual(undefined);
  });
});
