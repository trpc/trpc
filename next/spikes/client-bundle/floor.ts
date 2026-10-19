// Usage (from next/spikes): node client-bundle/floor.ts
//
// The Effect floor of a client: bundles steps 0..n of floor/steps.ts for each
// n and prints the total and what each step adds.
import { kb, measure } from './bundle.ts';

const steps = [
  ['s0Promise', 'runPromiseExit(tryPromise(fetch))'],
  ['s1LinkStreams', '+ links as Streams (suspend, catch, runHead)'],
  ['s2AsyncIterable', '+ Stream.toAsyncIterable (subscribe)'],
  ['s3Callback', '+ Stream.callback / Queue (SSE producer)'],
  ['s4Repeat', '+ Effect.repeat / sleep (SSE reconnect)'],
  ['s5Request', '+ Effect.request / RequestResolver (batching)'],
  ['s6Lines', '+ fromReadableStream / decodeText / splitLines (JSONL)'],
  ['s7Deferred', '+ Deferred / forkDetach / fromQueue (streamed outputs)'],
  ['s8Tracing', '+ Tracer / HttpTraceContext / Stream.withSpan'],
  ['s9HttpClient', '+ effect/http HttpClient + FetchHttpClient'],
] as const;

const file = new URL('./floor/steps.ts', import.meta.url).pathname;
console.log('| step | min | gzip | gzip added |');
console.log('| --- | ---: | ---: | ---: |');
let previous = 0;
for (let n = 0; n < steps.length; n++) {
  const names = steps.slice(0, n + 1).map(([name]) => name);
  const size = await measure({
    source: `export { ${names.join(', ')} } from ${JSON.stringify(file)};`,
  });
  console.log(
    `| ${steps[n]![1]} | ${kb(size.min)} | ${kb(size.gzip)} | ${n === 0 ? '' : `+${kb(size.gzip - previous)}`} |`,
  );
  previous = size.gzip;
}

console.log('\nalone, on top of step 1 (links as Streams):\n');
console.log('| step | gzip | added |');
console.log('| --- | ---: | ---: |');
const base = await measure({
  source: `export { s0Promise, s1LinkStreams } from ${JSON.stringify(file)};`,
});
for (const [name, what] of steps.slice(2)) {
  const size = await measure({
    source: `export { s0Promise, s1LinkStreams, ${name} } from ${JSON.stringify(file)};`,
  });
  console.log(
    `| ${what.replace(/^\+ /, '')} | ${kb(size.gzip)} | +${kb(size.gzip - base.gzip)} |`,
  );
}
