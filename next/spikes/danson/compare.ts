/**
 * Usage: `node danson/compare.ts` from `spikes/`.
 * URL lengths for QP-A / QP-B / QP-C, and rough encode/decode throughput.
 */
import * as original from 'danson';
import { Console, Effect } from 'effect';
import { Command } from 'effect/cli';
import { runScript } from '../kit.ts';
import { fromSearch, toQueryEntries, toSearch } from './query.ts';
import { deserializers, serializers } from './std.ts';
import { parseSync, serializeSync, stringifySync } from './sync.ts';

const ser = { serializers };
const de = { deserializers };

const inputs: Record<string, unknown> = {
  'proposal 11 example': {
    id: 1,
    q: 'hello world',
    tags: ['a', 'b'],
    since: new Date('2026-10-09'),
    filter: { status: 'open', archived: false },
  },
  'byId { id }': { id: 'post_123' },
  'paginated list': {
    cursor: 'eyJpZCI6MTAwfQ',
    limit: 20,
    sort: { by: 'createdAt', dir: 'desc' },
  },
  'search w/ arrays': {
    q: 'trpc effect',
    labels: ['bug', 'help wanted', 'good first issue'],
    authors: [{ login: 'katt' }, { login: 'juliusmarminge' }],
    range: { from: new Date(0), to: new Date('2026-01-01') },
  },
};

const qpA = (v: unknown) =>
  new URLSearchParams({
    input: JSON.stringify(serializeSync(v, ser)),
  }).toString();
const qpB = (v: unknown) => {
  const { json } = serializeSync(v, ser) as { json: Record<string, unknown> };
  return new URLSearchParams(
    Object.entries(json).map(([k, x]) => [
      k,
      typeof x === 'string' ? x : JSON.stringify(x),
    ]),
  ).toString();
};
const qpCStd = (v: unknown) =>
  new URLSearchParams(toQueryEntries(v, ser)).toString();

/** Ops per second of `fn`, run for about `ms` after a warm-up. */
const throughput = (fn: () => unknown, ms = 400) =>
  Effect.sync(() => {
    for (let i = 0; i < 2000; i++) fn();
    let n = 0;
    const start = performance.now();
    while (performance.now() - start < ms) {
      for (let i = 0; i < 200; i++) fn();
      n += 200;
    }
    return Math.round((n / (performance.now() - start)) * 1000);
  });

const compare = Command.make('compare', {}, () =>
  Effect.gen(function* () {
    yield* Console.log('## URL query length (bytes)\n');
    yield* Console.log(
      '| input | QP-A | QP-B | QP-C (URLSearchParams) | QP-C (legible) |',
    );
    yield* Console.log('| --- | ---: | ---: | ---: | ---: |');
    for (const [name, v] of Object.entries(inputs)) {
      yield* Console.log(
        `| ${name} | ${qpA(v).length} | ${qpB(v).length} | ${qpCStd(v).length} | ${toSearch(v, ser).length} |`,
      );
    }
    yield* Console.log('\n## Legible QP-C strings\n');
    for (const [name, v] of Object.entries(inputs)) {
      yield* Console.log(`- ${name}: \`?${toSearch(v, ser)}\``);
    }

    const v = inputs['search w/ arrays'];
    const search = toSearch(v, ser);
    const a = qpA(v);
    const text = stringifySync(v, ser);
    yield* Console.log(
      '\n## Throughput, "search w/ arrays" input (ops/s, single run)\n',
    );
    yield* Console.log('| operation | ops/s |');
    yield* Console.log('| --- | ---: |');
    const cases: ReadonlyArray<readonly [string, () => unknown]> = [
      ['JSON.stringify (no rich types)', () => JSON.stringify(v)],
      ['port stringifySync', () => stringifySync(v, ser)],
      ['danson stringifySync', () => original.stringifySync(v, ser)],
      ['port parseSync', () => parseSync(text, de)],
      ['danson parseSync', () => original.parseSync(text, de)],
      ['QP-A encode', () => qpA(v)],
      ['QP-C encode (legible)', () => toSearch(v, ser)],
      [
        'QP-A decode',
        () => parseSync(new URLSearchParams(a).get('input')!, de),
      ],
      ['QP-C decode', () => fromSearch(search, de)],
    ];
    for (const [label, fn] of cases) {
      const ops = yield* throughput(fn);
      yield* Console.log(`| ${label} | ${ops.toLocaleString('en-US')} |`);
    }
  }),
);

runScript(import.meta, compare);
