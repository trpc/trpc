/**
 * Properties of a pipelined batch, checked with fast-check on the code itself:
 * the budgets hold in whatever order the calls' data arrives, what a client
 * encodes the server reads back the same, and a response's runs are each
 * where their indexes say.
 */
import { fc, test } from '@fast-check/vitest';
import { isObject } from '../../utils';
import { encodePipelineReads, readPipelinedItem } from './client';
import { parsePipelineReads, pipelineCalls } from './server';
import type { PipelineCallReads, PipelineLimits, PipelinePipe } from './wire';
import { pipelineLimitDefaults } from './wire';

const none = {
  serialize: (it: unknown) => it,
  deserialize: (it: unknown) => it,
};

/** What a call of a generated batch reads, by the index of what it reads */
type GeneratedRead =
  | { kind: 'none' }
  /** Once for every item of the `items` of call `from` */
  | { kind: 'each'; from: number }
  /** The `v` of call `from`: in its frame, if it runs for every item */
  | { kind: 'whole'; from: number };

/** A batch: what each call reads, how much it has of its own, and the data each run returns */
const batchArbitrary = fc.integer({ min: 1, max: 5 }).chain((count) =>
  fc.record({
    calls: fc.tuple(
      ...Array.from({ length: count }, (_it, index) =>
        fc.record({
          read:
            index === 0
              ? fc.constant<GeneratedRead>({ kind: 'none' })
              : fc.oneof(
                  fc.constant<GeneratedRead>({ kind: 'none' }),
                  fc
                    .integer({ min: 0, max: index - 1 })
                    .map((from): GeneratedRead => ({ kind: 'each', from })),
                  fc
                    .integer({ min: 0, max: index - 1 })
                    .map((from): GeneratedRead => ({ kind: 'whole', from })),
                ),
          /** How long the input it sends is */
          pad: fc.integer({ min: 0, max: 30 }),
        }),
      ),
    ),
    /** How many items each run returns, and how long its `v` is */
    items: fc.integer({ min: 0, max: 3 }),
    valueLength: fc.integer({ min: 0, max: 20 }),
    maxRuns: fc.integer({ min: count, max: count + 8 }),
    maxFillSize: fc.integer({ min: 0, max: 300 }),
  }),
);

test.prop([batchArbitrary, fc.scheduler()], { numRuns: 300 })(
  'in any order the data arrives in, a batch runs no more than `maxRuns` procedures, fills in no more than `maxFillSize`, and every call ends',
  async (batch, s) => {
    const limits: PipelineLimits = {
      ...pipelineLimitDefaults,
      allowWholeValues: true,
      maxRuns: batch.maxRuns,
      maxFillSize: batch.maxFillSize,
    };
    /** Measured apart from the server's own count: the inputs are JSON */
    const sizeOf = (value: unknown) => JSON.stringify(value)?.length ?? 0;
    const pipe: PipelinePipe = {};
    for (const [index, call] of batch.calls.entries()) {
      switch (call.read.kind) {
        case 'none':
          break;
        case 'each':
          pipe[index] = {
            each: { from: call.read.from, path: ['items'] },
            reads: [{ to: ['n'], path: [] }],
          };
          break;
        case 'whole':
          pipe[index] = {
            reads: [{ to: ['w'], from: call.read.from, path: ['v'] }],
          };
          break;
      }
    }
    /** What each run of a procedure returns, once the scheduler lets it */
    const data = () =>
      s.schedule(
        Promise.resolve({
          items: Array.from({ length: batch.items }, (_it, at) => `i${at}`),
          v: 'v'.repeat(batch.valueLength),
        }),
      );
    let ran = 0;
    let filled = 0;
    /** The data of each call that ran once, for what reads it */
    const onceData = new Map<number, { v: string }>();

    const pipeline = pipelineCalls({
      calls: batch.calls.map((call) => ({
        getRawInput: async () => ({ pad: 'p'.repeat(call.pad) }),
        result: () => undefined,
      })),
      pipe,
      transformer: { input: none, output: none },
      maxRuns: null,
      limits,
    });
    const results = pipeline.run({
      call: async (call, run) => {
        const index = pipeline.calls.indexOf(call);
        try {
          if (run?.kind === 'each') {
            const items = await run.each({
              item: async (input) => {
                ran += 1;
                // Each run's whole input counts
                filled += sizeOf(input);
                return data();
              },
              error: () => 'error',
            });
            return { ok: true as const, data: items };
          }
          const input = run ? await run.input() : await call.getRawInput();
          ran += 1;
          const read = batch.calls[index]?.read;
          if (read?.kind === 'whole') {
            // Only the value it reads counts, as the procedure got it
            filled += sizeOf(isObject(input) ? input['w'] : undefined);
          }
          const result = await data();
          onceData.set(index, result);
          return { ok: true as const, data: result, input };
        } catch {
          return { ok: false as const };
        }
      },
      data: (result) => {
        if (!result.ok) {
          throw new Error('failed');
        }
        return result.data;
      },
    });

    // Every call ends, whatever the order, and every run of every list
    await s.waitFor(
      Promise.all(results.map(async (result) => settled(await result))),
    );
    expect(ran).toBeLessThanOrEqual(limits.maxRuns);
    expect(filled).toBeLessThanOrEqual(limits.maxFillSize);
  },
);

/** Once every run of a call for every item is done, at every level */
async function settled(value: unknown): Promise<void> {
  if (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    typeof value.data === 'object' &&
    value.data !== null &&
    'items' in value.data
  ) {
    await settledNode(value.data);
  }
}
async function settledNode(node: object): Promise<void> {
  if ('items' in node && Array.isArray(node.items)) {
    await Promise.all(
      node.items.map(async (item: unknown) => {
        const next = await item;
        if (typeof next === 'object' && next !== null) {
          await settledNode(next);
        }
      }),
    );
  }
}

const keyArbitrary = fc.oneof(
  fc.constantFrom('a', 'b', 'items', '__proto__', '0', ''),
  fc.string({ maxLength: 4 }),
);
const pathArbitrary = fc.array(fc.option(keyArbitrary, { nil: null }), {
  maxLength: 4,
});
const readsArbitrary: fc.Arbitrary<PipelineCallReads<number>> = fc
  .option(
    fc.record({ from: fc.integer({ min: 0, max: 2 }), path: pathArbitrary }),
    {
      nil: null,
    },
  )
  .chain((each) =>
    fc.record({
      each: fc.constant(each),
      reads: fc.array(
        each
          ? fc.oneof(
              fc.record({
                kind: fc.constant('whole' as const),
                to: fc.array(keyArbitrary, { maxLength: 3 }),
                from: fc.integer({ min: 0, max: 2 }),
                path: pathArbitrary,
              }),
              fc.record({
                kind: fc.constant('item' as const),
                to: fc.array(keyArbitrary, { maxLength: 3 }),
                path: pathArbitrary,
              }),
            )
          : fc.record({
              kind: fc.constant('whole' as const),
              to: fc.array(keyArbitrary, { maxLength: 3 }),
              from: fc.integer({ min: 0, max: 2 }),
              path: pathArbitrary,
            }),
        { maxLength: 4 },
      ),
    }),
  );

test.prop([readsArbitrary])(
  'what a client encodes, the server reads back the same, also through `JSON.stringify`',
  (reads) => {
    const json = JSON.stringify({ 3: encodePipelineReads(reads) });
    // Nothing that can be left out is `null`, which JSON would make of `undefined`
    expect(json).not.toContain('null,"path"');
    expect(
      parsePipelineReads({ pipe: json, sources: [0, 1, 2, 3] }).get(3),
    ).toEqual(reads);
  },
);

/** The runs of a call for every item, as a response has them */
type Items = { items: Record<string, Items> } | { result: { data: string } };

const itemsArbitrary = fc.letrec<{ node: Items }>((tie) => ({
  node: fc.oneof(
    { depthSize: 'small' },
    fc.string().map((data): Items => ({ result: { data } })),
    fc
      .array(tie('node'), { maxLength: 3 })
      .map((nodes): Items => ({ items: Object.fromEntries(nodes.entries()) })),
  ),
})).node;

/** Every run in `node`, with the indexes it is at */
function runsOf(node: Items, indexes: number[]): [number[], string][] {
  if ('result' in node) {
    return [[indexes, node.result.data]];
  }
  return Object.entries(node.items).flatMap(([at, item]) =>
    runsOf(item, [...indexes, Number(at)]),
  );
}

/** `node` as a stream has it: each level, and each run, a promise of its own */
function streamed(node: Items): unknown {
  if ('result' in node) {
    return Promise.resolve(node);
  }
  return Promise.resolve({
    items: Promise.resolve(
      Object.fromEntries(
        Object.entries(node.items).map(([at, item]) => [at, streamed(item)]),
      ),
    ),
  });
}

test.prop([itemsArbitrary, fc.boolean()])(
  'every run of a response is at its indexes, streamed or not',
  async (items, isStreamed) => {
    const value = isStreamed ? streamed(items) : items;
    for (const [indexes, data] of runsOf(items, [])) {
      expect(await readPipelinedItem(value, indexes)).toEqual({
        kind: 'data',
        data,
      });
    }
  },
);
