/** Bytes of one streamed output framed as JSONL and as SSE: `node sse-deferred/measure.ts [items]`. */
import { Console, Effect, Stream } from 'effect';
import { Command } from 'effect/cli';
import { createSerializer, jsonTransformer } from '@trpc12/trpc/transformer';
import { intArg, runScript } from '../kit.ts';
import { framesOf, toJsonl, toSse } from './sse.ts';

const value = (items: number) => ({
  items: (async function* () {
    for (let i = 0; i < items; i++) {
      yield { i, title: `post ${i}`, author: Promise.resolve({ name: 'ada' }) };
    }
  })(),
});
const size = (text: Stream.Stream<string>) =>
  Stream.runFold(
    Stream.encodeText(text),
    () => 0,
    (n, c) => n + c.length,
  );

const measure = Command.make(
  'measure',
  { items: intArg('items', 200) },
  ({ items }) =>
    Effect.gen(function* () {
      for (const [name, serializer] of [
        ['json', jsonTransformer],
        ['danson', createSerializer()],
      ] as const) {
        const lines = () =>
          Stream.map(framesOf(serializer, value(items)), (f) =>
            JSON.stringify(f),
          );
        const jsonl = yield* size(toJsonl(lines()));
        const sse = yield* size(toSse(lines()));
        yield* Console.log(
          `${name}: ${items} items, jsonl ${jsonl} B, sse ${sse} B (${(sse / jsonl).toFixed(2)}x)`,
        );
      }
    }),
);

runScript(import.meta, measure);
