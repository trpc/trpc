/** Bytes of one streamed output framed as JSONL and as SSE: `node sse-deferred/measure.ts [items]`. */
import { Effect, Stream } from 'effect';
import { createSerializer, jsonSerializer } from 'trpcdev/serializer';
import { framesOf, toJsonl, toSse } from './sse.ts';

const items = Number(process.argv[2] ?? 200);
const value = () => ({
  items: (async function* () {
    for (let i = 0; i < items; i++) {
      yield { i, title: `post ${i}`, author: Promise.resolve({ name: 'ada' }) };
    }
  })(),
});
const size = (text: Stream.Stream<string>) =>
  Effect.runPromise(
    Stream.runFold(
      Stream.encodeText(text),
      () => 0,
      (n, c) => n + c.length,
    ),
  );

for (const [name, serializer] of [
  ['json', jsonSerializer],
  ['danson', createSerializer()],
] as const) {
  const lines = () =>
    Stream.map(framesOf(serializer, value()), (f) => JSON.stringify(f));
  const jsonl = await size(toJsonl(lines()));
  const sse = await size(toSse(lines()));
  console.log(
    `${name}: ${items} items, jsonl ${jsonl} B, sse ${sse} B (${(sse / jsonl).toFixed(2)}x)`,
  );
}
