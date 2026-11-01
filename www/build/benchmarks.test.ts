import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Result } from 'effect';

import {
  benchmarkMarkdown,
  expandBenchmarks,
  parityGroups,
  type Snapshot,
  typescriptProblem,
} from './benchmarks.ts';
import { chartHtml, chartMarkdown, decodeChart } from './charts.ts';

const environment: Omit<
  Snapshot['runtime'],
  'connections' | 'duration' | 'results' | 'versions'
> = {
  commit: 'abc123456',
  date: '2026-10-20',
  machine: '4-core CPU, 16 GB',
  node: 'v26.12.0',
};

const versions: Snapshot['runtime']['versions'] = {
  '@orpc/server': '2.0.0',
  '@trpc/server': '11.19.0',
};

const size = (gzip: number) => ({ gzip, minified: gzip * 3 });

const snapshot: Snapshot = {
  bundle: {
    ...environment,
    results: [
      { client: size(40_000), fetch: size(1), name: 'tRPC v12', node: size(1) },
      { client: size(10_000), fetch: size(1), name: 'tRPC v11', node: size(1) },
      { client: size(8_000), fetch: size(1), name: 'oRPC v2', node: size(1) },
    ],
    versions: { ...versions, rolldown: '1.2.13' },
  },
  runtime: {
    ...environment,
    connections: 10,
    duration: 10,
    results: [
      { name: 'tRPC v12', requests: 1, requestsPerSecond: 40_000, stdev: 1 },
      { name: 'tRPC v11', requests: 1, requestsPerSecond: 20_000, stdev: 1 },
      { name: 'oRPC v2', requests: 1, requestsPerSecond: 80_000, stdev: 1 },
    ],
    versions,
  },
  typecheck: {
    ...environment,
    procedures: 3000,
    results: [],
    routers: 1501,
    runs: 3,
    versions: { ...versions, typescript: '7.1.0-beta' },
  },
};

/** The `chart` fences of some markdown, decoded. */
const chartsIn = (markdown: string) =>
  Array.from(markdown.matchAll(/^```chart\n(.*)\n```$/gm), (match) =>
    decodeChart(match[1] ?? ''),
  );

describe('benchmarkMarkdown', () => {
  it('charts a section with tRPC v12 highlighted and its ratio to the others', () => {
    const markdown = benchmarkMarkdown(snapshot, 'runtime');
    expect(chartsIn(markdown)).toEqual([
      {
        bars: [
          { highlight: true, label: 'tRPC v12', text: '40,000', value: 40_000 },
          {
            highlight: false,
            label: 'tRPC v11',
            text: '20,000',
            value: 20_000,
          },
          { highlight: false, label: 'oRPC v2', text: '80,000', value: 80_000 },
        ],
        better: 'higher',
        note: 'tRPC v12: 2.00× tRPC v11, 0.50× oRPC v2.',
        title: 'Requests per second',
      },
    ]);
    expect(markdown).toContain(
      'Measured 2026-10-20 at [`abc123456`](https://github.com/trpc/trpc/commit/abc123456)',
    );
  });

  it('charts the gzipped sizes, with the minified ones beside them', () => {
    const charts = chartsIn(benchmarkMarkdown(snapshot, 'bundle'));
    expect(charts.map((chart) => chart.title)).toEqual([
      'Client, gzipped',
      'Node server, gzipped',
      'Fetch handler, gzipped',
    ]);
    expect(charts[0]?.bars[0]?.text).toBe('40.0 kB (120.0 kB minified)');
    expect(charts[0]?.note).toBe('tRPC v12: 4.00× tRPC v11, 5.00× oRPC v2.');
  });
});

describe('typescriptProblem', () => {
  it('takes type benchmarks run on TypeScript 7.1 only', () => {
    expect(typescriptProblem(snapshot)).toBeUndefined();
    const on = (typescript: string) =>
      typescriptProblem({
        ...snapshot,
        typecheck: {
          ...snapshot.typecheck,
          versions: { ...snapshot.typecheck.versions, typescript },
        },
      });
    expect(on('7.1.2')).toBeUndefined();
    expect(on('7.0.2')).toBe(
      'the typecheck ran on TypeScript 7.0.2, and the type benchmarks run on 7.1.x only',
    );
    expect(on('6.0.3')).toBeDefined();
  });
});

describe('parityGroups', () => {
  it('reads the feature tables by heading, without their Where column, and skips the others', () => {
    const groups = parityGroups(
      [
        '## Type safety',
        '',
        '| Feature | oRPC | v11 | v12 | Where |',
        '| ------- | ---- | --- | --- | ----- |',
        '| Errors  | ✅   | 🟡  | ✅  | [inferred](../decisions/inferred-errors.md) |',
        '| Scale   | ✅   | ✅  | 🟡  | numbers |',
        '',
        '## Performance',
        '',
        '| Metric | oRPC v2 | v11 | v12 |',
        '| ------ | ------- | --- | --- |',
        '| req/s  | 1       | 2   | 3   |',
        '',
        '## Beyond the table',
        '',
        '| Feature | Status |',
        '| ------- | ------ |',
        '| Codemod | done   |',
      ].join('\n'),
    );
    expect(groups).toEqual([
      {
        rows: [
          { feature: 'Errors', orpc: '✅', v11: '🟡', v12: '✅' },
          { feature: 'Scale', orpc: '✅', v11: '✅', v12: '🟡' },
        ],
        title: 'Type safety',
      },
    ]);
  });
});

describe('charts', () => {
  const chart = decodeChart(
    JSON.stringify({
      bars: [
        { highlight: true, label: 'tRPC v12', text: '1 s', value: 1 },
        { label: 'oRPC v2', text: '<2 s>', value: 2 },
      ],
      better: 'lower',
      note: 'A note.',
      title: 'Check time',
    }),
  );

  it('draws each bar against the largest, and escapes the text', () => {
    const html = chartHtml(chart);
    expect(html).toContain('style="width: 50.0%"');
    expect(html).toContain('style="width: 100.0%"');
    expect(html).toContain('&#x3C;2 s>');
    expect(html).toContain('data-highlight');
    expect(html).toContain('lower is better');
  });

  it('is a table in the markdown', () => {
    expect(chartMarkdown(chart)).toBe(
      [
        '| Check time (lower is better) | |',
        '| --- | ---: |',
        '| tRPC v12 | 1 s |',
        '| oRPC v2 | <2 s> |',
        '',
        'A note.',
      ].join('\n'),
    );
  });

  it("rejects a fence that isn't a chart", () => {
    expect(() => decodeChart('{"title":"x"}')).toThrow('Missing key');
  });
});

describe('expandBenchmarks', () => {
  it.effect('expands the committed snapshot and orpc-parity.md', () =>
    Effect.gen(function* () {
      const expanded = yield* expandBenchmarks(
        '```benchmark\nruntime\n```\n\n```benchmark\ntypecheck\n```\n\n```benchmark\nbundle\n```\n\n```parity\n\n```\n',
        'benchmarks.md',
      );
      expect(chartsIn(expanded.markdown)).toHaveLength(7);
      expect(expanded.markdown).toContain('### Type safety');
      expect(expanded.markdown).toContain(
        '| End-to-end typesafe input/output | ✅ | ✅ | ✅ |',
      );
      expect(expanded.markdown).not.toContain('../decisions/');
      expect(expanded.files).toHaveLength(2);
      const fs = yield* FileSystem.FileSystem;
      for (const file of expanded.files) {
        expect(yield* fs.exists(file)).toBe(true);
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("fails on a benchmark that isn't one", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        expandBenchmarks('```benchmark\nwebsocket\n```\n', 'benchmarks.md'),
      );
      expect(Result.isFailure(result)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect('leaves a page without the fences as it is', () =>
    Effect.gen(function* () {
      const expanded = yield* expandBenchmarks('# Hi\n', 'page.md');
      expect(expanded).toEqual({ files: [], markdown: '# Hi\n' });
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
