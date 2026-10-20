import { Effect, FileSystem, Path, Schema } from 'effect';

import { site } from '../src/site.ts';
import type { Chart } from './charts.ts';
import { ContentError, messageOf } from './content-error.ts';

const Environment = Schema.Struct({
  /** The commit of `next/` it ran at. */
  commit: Schema.String,
  date: Schema.String,
  machine: Schema.String,
  node: Schema.String,
});

const Versions = Schema.Struct({
  '@orpc/server': Schema.String,
  '@trpc/server': Schema.String,
});

const Size = Schema.Struct({ gzip: Schema.Number, minified: Schema.Number });

/**
 * `www/benchmarks.json`, which `pnpm bench <runtime|typecheck|bundle>
 * --snapshot` writes, a section each (`tooling/bench/bench.ts`).
 */
export const Snapshot = Schema.Struct({
  bundle: Schema.Struct({
    ...Environment.fields,
    results: Schema.Array(
      Schema.Struct({
        client: Size,
        fetch: Size,
        name: Schema.String,
        node: Size,
      }),
    ),
    versions: Schema.Struct({ ...Versions.fields, rolldown: Schema.String }),
  }),
  runtime: Schema.Struct({
    ...Environment.fields,
    connections: Schema.Number,
    duration: Schema.Number,
    results: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        requests: Schema.Number,
        requestsPerSecond: Schema.Number,
        stdev: Schema.Number,
      }),
    ),
    versions: Versions,
  }),
  typecheck: Schema.Struct({
    ...Environment.fields,
    procedures: Schema.Number,
    results: Schema.Array(
      Schema.Struct({
        checkSeconds: Schema.Number,
        instantiations: Schema.Number,
        memoryMb: Schema.Number,
        name: Schema.String,
        totalSeconds: Schema.Number,
      }),
    ),
    routers: Schema.Number,
    runs: Schema.Number,
    versions: Schema.Struct({ ...Versions.fields, typescript: Schema.String }),
  }),
});

export type Snapshot = typeof Snapshot.Type;

const decodeSnapshot = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Snapshot),
);

/** The framework the charts highlight. */
const v12 = 'tRPC v12';

/** The TypeScript the type benchmarks run on, and only it (`decisions/typescript-versions.md`). */
const typescriptLine = '7.1.';

const thousands = (n: number) => Math.round(n).toLocaleString('en-US');
const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;

/** `tRPC v12: 3.14× tRPC v11, 0.77× oRPC v2.` */
function ratios(bars: Chart['bars']) {
  const ours = bars.find((bar) => bar.label === v12);
  const others = bars.filter((bar) => bar.label !== v12 && bar.value > 0);
  if (!ours || others.length === 0) {
    return undefined;
  }
  const times = (other: Chart['bars'][number]) => {
    const ratio = ours.value / other.value;
    return `${ratio.toFixed(ratio < 10 ? 2 : 1)}× ${other.label}`;
  };
  return `${v12}: ${others.map(times).join(', ')}.`;
}

function chart(
  title: string,
  better: Chart['better'],
  bars: ReadonlyArray<Omit<Chart['bars'][number], 'highlight'>>,
): Chart {
  const highlighted = bars.map((bar) => ({
    ...bar,
    highlight: bar.label === v12,
  }));
  return { bars: highlighted, better, note: ratios(highlighted), title };
}

const fence = (value: Chart) => `\`\`\`chart\n${JSON.stringify(value)}\n\`\`\``;

const commitLink = (commit: string) =>
  `[\`${commit}\`](${site.github}/commit/${commit})`;

/** Where and when a section was measured, as a sentence. */
function measured(section: Snapshot[keyof Snapshot]) {
  return `Measured ${section.date} at ${commitLink(section.commit)} against \`@trpc/server\` ${section.versions['@trpc/server']} and \`@orpc/server\` ${section.versions['@orpc/server']}, on Node ${section.node} (${section.machine})`;
}

const benchmarkIds = ['runtime', 'typecheck', 'bundle'] as const;

export type BenchmarkId = (typeof benchmarkIds)[number];

const isBenchmarkId = (id: string): id is BenchmarkId =>
  (benchmarkIds as ReadonlyArray<string>).includes(id);

/** Why the snapshot's type benchmarks can't be shown, if they can't. */
export function typescriptProblem(snapshot: Snapshot) {
  const version = snapshot.typecheck.versions.typescript;
  return version.startsWith(typescriptLine)
    ? undefined
    : `the typecheck ran on TypeScript ${version}, and the type benchmarks run on ${typescriptLine}x only`;
}

/** A `benchmark` fence's charts and the sentence saying how they were measured. */
export function benchmarkMarkdown(snapshot: Snapshot, id: BenchmarkId) {
  if (id === 'runtime') {
    const section = snapshot.runtime;
    return [
      fence(
        chart(
          'Requests per second',
          'higher',
          section.results.map((result) => ({
            label: result.name,
            text: thousands(result.requestsPerSecond),
            value: result.requestsPerSecond,
          })),
        ),
      ),
      `${measured(section)}: ${String(section.duration)} s on ${String(section.connections)} connections, after a 2 s warm-up.`,
    ].join('\n\n');
  }
  if (id === 'typecheck') {
    const section = snapshot.typecheck;
    return [
      fence(
        chart(
          'Check time',
          'lower',
          section.results.map((result) => ({
            label: result.name,
            text: `${result.checkSeconds.toFixed(2)} s`,
            value: result.checkSeconds,
          })),
        ),
      ),
      fence(
        chart(
          'Type instantiations',
          'lower',
          section.results.map((result) => ({
            label: result.name,
            text: thousands(result.instantiations),
            value: result.instantiations,
          })),
        ),
      ),
      fence(
        chart(
          'Memory',
          'lower',
          section.results.map((result) => ({
            label: result.name,
            text: `${String(result.memoryMb)} MB`,
            value: result.memoryMb,
          })),
        ),
      ),
      `${measured(section)}: ${thousands(section.procedures)} procedures in ${thousands(section.routers)} routers, checked by \`tsc\` ${section.versions.typescript} on one thread, the median of ${String(section.runs)} runs.`,
    ].join('\n\n');
  }
  const section = snapshot.bundle;
  const sizes = (kind: 'client' | 'fetch' | 'node') =>
    section.results.map((result) => ({
      label: result.name,
      text: `${kb(result[kind].gzip)} (${kb(result[kind].minified)} minified)`,
      value: result[kind].gzip,
    }));
  return [
    fence(chart('Client, gzipped', 'lower', sizes('client'))),
    fence(chart('Node server, gzipped', 'lower', sizes('node'))),
    fence(chart('Fetch handler, gzipped', 'lower', sizes('fetch'))),
    `${measured(section)}: bundled by rolldown ${section.versions.rolldown}, tree-shaken and minified, then gzip -9.`,
  ].join('\n\n');
}

/** A row of a feature table in `orpc-parity.md`. */
interface ParityRow {
  readonly feature: string;
  readonly orpc: string;
  readonly v11: string;
  readonly v12: string;
}

interface ParityGroup {
  readonly rows: ReadonlyArray<ParityRow>;
  readonly title: string;
}

const cellsOf = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

/**
 * The feature tables of `.agent-docs/reference/orpc-parity.md`, by their
 * `##` headings: the ones whose columns start Feature, oRPC, v11, v12. The
 * Where column is left out: it links the decisions, which the site doesn't.
 */
export function parityGroups(markdown: string): ReadonlyArray<ParityGroup> {
  const groups: Array<ParityGroup> = [];
  let title: string | undefined;
  let rows: Array<ParityRow> | undefined;
  for (const line of markdown.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading?.[1] !== undefined) {
      title = heading[1].trim();
      rows = undefined;
      continue;
    }
    if (!line.startsWith('|')) {
      rows = undefined;
      continue;
    }
    const cells = cellsOf(line);
    if (rows === undefined) {
      if (
        title !== undefined &&
        cells.slice(0, 4).join(' ') === 'Feature oRPC v11 v12'
      ) {
        rows = [];
        groups.push({ rows, title });
      }
      continue;
    }
    const [feature = '', orpc = '', v11 = '', v12 = ''] = cells;
    if (/^:?-+:?$/.test(feature)) {
      continue;
    }
    rows.push({ feature, orpc, v11, v12 });
  }
  return groups;
}

function parityMarkdown(groups: ReadonlyArray<ParityGroup>) {
  return groups
    .map((group) =>
      [
        `### ${group.title}`,
        '',
        '| Feature | oRPC v2 | tRPC v11 | tRPC v12 |',
        '| --- | :-: | :-: | :-: |',
        ...group.rows.map(
          (row) => `| ${row.feature} | ${row.orpc} | ${row.v11} | ${row.v12} |`,
        ),
      ].join('\n'),
    )
    .join('\n\n');
}

const benchmarkFence = /^```benchmark\n([^\n]*)\n```$/gm;
const parityFence = /^```parity\n(?:[ \t]*\n)*```$/gm;

const snapshotUrl = new URL('../benchmarks.json', import.meta.url);
const parityUrl = new URL(
  '../../.agent-docs/reference/orpc-parity.md',
  import.meta.url,
);

/**
 * A `benchmark` fence (`runtime`, `typecheck` or `bundle`) becomes the charts
 * of that section of `www/benchmarks.json`, as `chart` fences, and a sentence
 * saying how it was measured. An empty `parity` fence becomes the feature
 * tables of `orpc-parity.md`. Both fail on data they can't read, and the
 * snapshot's type benchmarks on a TypeScript that isn't 7.1.
 */
export const expandBenchmarks = Effect.fn('expandBenchmarks')(function* (
  markdown: string,
  file: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fail = (message: string, cause?: unknown) =>
    new ContentError({ cause, message: `${file}: ${message}` });
  const files: Array<string> = [];
  let expanded = markdown;
  const benchmarks = Array.from(markdown.matchAll(benchmarkFence), (match) =>
    (match[1] ?? '').trim(),
  );
  if (benchmarks.length > 0) {
    const unknown = benchmarks.filter((id) => !isBenchmarkId(id));
    if (unknown.length > 0) {
      return yield* fail(
        `${unknown.join(', ')} isn't a benchmark; the benchmarks are ${benchmarkIds.join(', ')}`,
      );
    }
    const snapshotFile = yield* path.fromFileUrl(snapshotUrl);
    files.push(snapshotFile);
    const snapshot = yield* fs.readFileString(snapshotFile).pipe(
      Effect.flatMap(decodeSnapshot),
      Effect.mapError((cause) =>
        fail(`www/benchmarks.json: ${messageOf(cause)}`, cause),
      ),
    );
    const problem = typescriptProblem(snapshot);
    if (problem !== undefined) {
      return yield* fail(`www/benchmarks.json: ${problem}`);
    }
    expanded = expanded.replaceAll(benchmarkFence, (_fence, raw: string) => {
      const id = raw.trim();
      return isBenchmarkId(id) ? benchmarkMarkdown(snapshot, id) : '';
    });
  }
  if (markdown.search(parityFence) !== -1) {
    const parityFile = yield* path.fromFileUrl(parityUrl);
    files.push(parityFile);
    const groups = parityGroups(
      yield* fs
        .readFileString(parityFile)
        .pipe(Effect.mapError((cause) => fail(messageOf(cause), cause))),
    );
    if (
      groups.length === 0 ||
      groups.some((group) => group.rows.length === 0)
    ) {
      return yield* fail(
        'orpc-parity.md has no feature tables whose columns start Feature, oRPC, v11, v12, or one of them is empty',
      );
    }
    expanded = expanded.replaceAll(parityFence, () => parityMarkdown(groups));
  }
  return { files, markdown: expanded };
});
