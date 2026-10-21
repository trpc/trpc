/**
 * `node error-registry/bench.ts [--procedures 1500] [--errors 24] [--runs 3]
 * [--only a,b]` from `spikes/`: what each registry option costs to
 * type-check, the way `pnpm bench shapes` measures v12 (`pnpm build`
 * first: v12 is read from its `.d.ts`).
 *
 * Each option writes a project of `procedures` procedures (files of 10,
 * half queries and half mutations), each failing with one of `errors`
 * registry errors (half with `data`), and a client file per router file
 * calling each procedure through `safe()` and a `matchError()` that spreads
 * the app's handlers and overrides one. `… effect` options call through the
 * Effect client with one `catchTag` instead. Each project is checked with
 * tsc 7.1 (`--singleThreaded`) twice: the server half, then with the
 * client. "per procedure" subtracts the same project with no procedures.
 */
import { Console, Effect } from 'effect';
import { Command, Flag } from 'effect/cli';
import { join, relative } from 'node:path';
import { medianDiagnostics, runScript, writeFixture, type Files } from '../kit.ts';

const PER_FILE = 10;
const here = import.meta.dirname;
const dist = join(here, '../../packages/trpc/dist');

interface Gen {
  readonly n: number;
  readonly errors: number;
  /** The fixture's directory. */
  readonly dir: string;
}

/** What an option writes besides the shared files. */
interface Option {
  /** The spike module the fixture imports, from `spikes/error-registry/`. */
  readonly module: string;
  /** `errors.ts` (and any module files), importing the spike as `./spike.ts`. */
  readonly errorFiles: (g: Gen) => Files;
  /** Procedure `i` failing with error `k`; `kind` its terminal. */
  readonly impl: (i: number, k: number, kind: string) => string;
  /** A router file's imports, from `router/`. */
  readonly routerImports: string;
  /** Wraps a router file's routes. */
  readonly file?: (f: number, routes: string) => string;
  /** `router/index.ts`. */
  readonly root: (files: ReadonlyArray<number>) => string;
  /** The client path of file `f`. */
  readonly path?: (f: number) => string;
  /** The tag of error `k` in file `f`. */
  readonly tag?: (f: number, k: number) => string;
  /** The handlers each `matchError()` spreads, for file `f`. */
  readonly handlers?: (f: number) => string;
  /** `client.ts`'s handler objects. */
  readonly handlerDecls: (g: Gen) => string;
  readonly effect?: true;
}

const data = (k: number) => k % 2 === 0;
const status = (k: number) => 400 + (k % 30);
const spec = (k: number, name = `E${k}`) =>
  `{ status: ${status(k)}${data(k) ? `, data: {} as S<{ ${name}_id: string }>` : ''} }`;
const args = (k: number, name = `E${k}`) => (data(k) ? `{ ${name}_id: 'x' }` : '');
const body = (i: number, fail: string) =>
  `(opts) => {\n    if (opts.input.a_${i} === '') throw ${fail};\n    return { v_${i}: opts.input.a_${i} };\n  }`;
const input = (i: number) => `.input({} as S<{ a_${i}: string }>)`;
const tags = (g: Gen) => Array.from({ length: g.errors }, (_, k) => `E${k}`);
const link = "NetworkError: () => 'offline', BadResponse: (e: { message: string }) => e.message";
const handlerObject = (names: ReadonlyArray<string>) =>
  `{ ${names.map((n) => `${n}: (e: { message: string }) => e.message`).join(', ')}, ${link} }`;

const errorsObject = (g: Gen) =>
  `{\n${tags(g)
    .map((tag, k) => `  ${tag}: ${spec(k)},`)
    .join('\n')}\n}`;

/** A, C, E, F, B: one registry for the whole backend. */
const whole = (o: Omit<Option, 'root' | 'routerImports' | 'handlerDecls'> & Partial<Option>): Option => ({
  routerImports: `import { errors } from '../errors';`,
  root: (files) =>
    `import { withErrors } from '../spike';\nimport { errors } from '../errors';\n${files.map((f) => `import { f${f} } from './f${f}';`).join('\n')}\n\nexport const router = withErrors(errors, {\n${files.map((f) => `  f${f},`).join('\n')}\n});\n`,
  handlerDecls: (g) => `export const handlers = ${handlerObject(tags(g))};\n`,
  ...o,
});

const throwIt = (i: number, k: number, kind: string) =>
  `t.procedure${input(i)}.${kind}(${body(i, `new errors.E${k}(${args(k)})`)})`;

const options = {
  'create-errors': whole({
    module: 'create-errors/create-errors.ts',
    errorFiles: (g) => [
      ['errors.ts', `import { createErrors } from './spike';\nimport type { S } from './base';\n\nexport const errors = createErrors(${errorsObject(g)});\n`],
    ],
    impl: throwIt,
  }),
  'tagged-classes': whole({
    module: 'tagged-classes/tagged-classes.ts',
    errorFiles: (g) => [
      [
        'errors.ts',
        `import { Schema } from 'effect';\nimport { taggedErrors } from './spike';\nimport { t } from './base';\n\n${tags(g)
          .map(
            (tag, k) =>
              `export class ${tag} extends Schema.TaggedError<${tag}>()('${tag}', { ${data(k) ? `${tag}_id: Schema.String` : ''} }, { httpApiStatus: ${status(k)} }) {}`,
          )
          .join('\n')}\n\nexport const errors = taggedErrors(${tags(g).join(', ')});\nexport const procedure = t.procedure.use(errors.bridge);\n`,
      ],
    ],
    routerImports: `import * as errors from '../errors';\nimport { procedure } from '../errors';`,
    impl: (i, k, kind) => `procedure${input(i)}.${kind}(${body(i, `new errors.E${k}(${args(k)})`)})`,
    root: (files) =>
      `import { withErrors } from '../spike';\nimport { errors } from '../errors';\n${files.map((f) => `import { f${f} } from './f${f}';`).join('\n')}\n\nexport const router = withErrors(errors, {\n${files.map((f) => `  f${f},`).join('\n')}\n});\n`,
  }),
  builder: whole({
    module: 'builder/builder.ts',
    errorFiles: (g) => [
      ['errors.ts', `import { errors as registry } from './spike';\nimport type { S } from './base';\n\nexport const errors = registry()\n${tags(g)
        .map((tag, k) => `  .add('${tag}', ${spec(k)})`)
        .join('\n')};\n`],
    ],
    impl: throwIt,
  }),
  'merge-errors': {
    module: 'merge-errors/merge-errors.ts',
    // Three modules and a common registry, the errors split between them.
    errorFiles: (g) => {
      const per = Math.floor((g.errors - 3) / 3);
      const mod = (name: string, prefix: string, count: number): readonly [string, string] => [
        `errors/${name}.ts`,
        `import { createErrors } from '../spike';\nimport type { S } from '../base';\n\nexport const ${name} = createErrors({\n${Array.from({ length: count }, (_, k) => `  ${prefix}${k}: ${spec(k, `${prefix}${k}`)},`).join('\n')}\n});\n`,
      ];
      return [
        mod('common', 'C', 3),
        mod('m0', 'Ma', per),
        mod('m1', 'Mb', per),
        mod('m2', 'Mc', g.errors - 3 - 2 * per),
      ];
    },
    routerImports: `import { m0, m1, m2 } from '../errors/index';`,
    impl: (i, k, kind) => {
      const m = Math.floor(i / PER_FILE) % 3;
      return `t.procedure${input(i)}.${kind}(${body(i, `new m${m}.M${'abc'[m]}${k % 7}(${args(k % 7, `M${'abc'[m]}${k % 7}`)})`)})`;
    },
    root: (files) => {
      const mods = [0, 1, 2].map(
        (m) =>
          `  m${m}: scope(m${m}, {\n${files
            .filter((f) => f % 3 === m)
            .map((f) => `    f${f},`)
            .join('\n')}\n  }),`,
      );
      return `import { scope, withErrors } from '../spike';\nimport { common, m0, m1, m2 } from '../errors/index';\n${files.map((f) => `import { f${f} } from './f${f}';`).join('\n')}\n\nexport const router = withErrors(common, {\n${mods.join('\n')}\n});\n`;
    },
    path: (f) => `m${f % 3}.f${f}`,
    tag: (f, k) => `M${'abc'[f % 3]}${k % 7}`,
    handlers: (f) => `handlers${f % 3}`,
    handlerDecls: (g) => {
      const per = Math.floor((g.errors - 3) / 3);
      const counts = [per, per, g.errors - 3 - 2 * per];
      return [0, 1, 2]
        .map(
          (m) =>
            `export const handlers${m} = ${handlerObject([
              'C0',
              'C1',
              'C2',
              ...Array.from({ length: counts[m]! }, (_, k) => `M${'abc'[m]}${k}`),
            ])};`,
        )
        .join('\n');
    },
  },
  register: {
    module: 'register/register.ts',
    // Three modules, each extending the global `Errors` with its own.
    errorFiles: (g) => {
      const per = Math.ceil(g.errors / 3);
      const files: Array<readonly [string, string]> = [0, 1, 2].map((m) => {
        const ks = tags(g).slice(m * per, (m + 1) * per);
        return [
          `errors/m${m}.ts`,
          `import { createErrors } from '../spike';\nimport type { S } from '../base';\n\nexport const m${m} = createErrors({\n${ks.map((tag) => `  ${tag}: ${spec(Number(tag.slice(1)))},`).join('\n')}\n});\ntype M${m} = typeof m${m};\ndeclare module '${relative(join(g.dir, 'errors'), join(here, 'register/register.ts'))}' {\n  interface Errors extends M${m} {}\n}\n`,
        ];
      });
      files.push(['errors.ts', `import { m0 } from './errors/m0';\nimport { m1 } from './errors/m1';\nimport { m2 } from './errors/m2';\n\nexport const errors = { ...m0, ...m1, ...m2 };\n`]);
      return files;
    },
    routerImports: `import { errors } from '../errors';`,
    impl: throwIt,
    root: (files) =>
      `${files.map((f) => `import { f${f} } from './f${f}';`).join('\n')}\n\nexport const router = {\n${files.map((f) => `  f${f},`).join('\n')}\n};\n`,
    handlerDecls: (g) => `export const handlers = ${handlerObject(tags(g))};\n`,
  },
  inferred: {
    module: 'inferred/inferred.ts',
    errorFiles: (g) => [
      ['errors.ts', `import { defineError } from './spike';\nimport type { S } from './base';\n\n${tags(g)
        .map((tag, k) => `export class ${tag} extends defineError('${tag}', ${spec(k)}) {}`)
        .join('\n')}\n`],
    ],
    routerImports: `import * as errors from '../errors';`,
    impl: (i, k, kind) =>
      `t.procedure${input(i)}.${kind}((opts) => opts.input.a_${i} === '' ? new errors.E${k}(${args(k)}) : { v_${i}: opts.input.a_${i} })`,
    root: (files) =>
      `${files.map((f) => `import { f${f} } from './f${f}';`).join('\n')}\n\nexport const router = {\n${files.map((f) => `  f${f},`).join('\n')}\n};\n`,
    handlerDecls: (g) => `export const handlers = ${handlerObject(tags(g))};\n`,
  },
} satisfies Record<string, Option>;

const withEffect = (o: Option): Option => ({ ...o, effect: true });
const all = {
  ...options,
  'create-errors effect': withEffect(options['create-errors']),
  'tagged-classes effect': withEffect(options['tagged-classes']),
};
type Name = keyof typeof all;

const tsconfig = (include: ReadonlyArray<string>) =>
  JSON.stringify(
    {
      compilerOptions: {
        target: 'esnext',
        module: 'esnext',
        moduleResolution: 'bundler',
        moduleDetection: 'force',
        lib: ['esnext', 'dom'],
        types: [],
        strict: true,
        noUncheckedIndexedAccess: true,
        skipLibCheck: true,
        noEmit: true,
        allowImportingTsExtensions: true,
        paths: { '@trpc12/trpc/*': [`${dist}/*/index.d.ts`] },
      },
      include,
    },
    null,
    2,
  );

const fixture = (name: Name, g: Gen, dir: string): Files => {
  const o: Option = all[name];
  const spike = relative(dir, join(here, o.module));
  const files: Array<readonly [string, string]> = [
    ['spike.ts', `export * from '${spike}';\n`],
    [
      'base.ts',
      `import { initTrpc, type StandardSchemaV1 } from '@trpc12/trpc/server';\n\nexport type S<T> = StandardSchemaV1<T, T>;\nexport const t = initTrpc<{ ctx: { user: string | null } }>({ warnThrownErrors: false });\n`,
    ],
    ...o.errorFiles(g),
  ];
  if (name.startsWith('merge-errors')) {
    files.push(['errors/index.ts', `export { common } from './common';\nexport { m0 } from './m0';\nexport { m1 } from './m1';\nexport { m2 } from './m2';\nimport { mergeErrors } from '../spike';\nimport { common } from './common';\nimport { m0 } from './m0';\nimport { m1 } from './m1';\nimport { m2 } from './m2';\n\nexport const errors = mergeErrors(common, m0, m1, m2);\n`]);
  }
  const ids = Array.from({ length: Math.ceil(g.n / PER_FILE) }, (_, f) => f);
  const inFile = (f: number) =>
    Array.from({ length: Math.min(PER_FILE, g.n - f * PER_FILE) }, (_, p) => f * PER_FILE + p);
  const kind = (i: number) => (i % 2 === 0 ? 'query' : 'mutation');
  const k = (i: number) => i % g.errors;
  for (const f of ids) {
    const routes = `{\n${inFile(f)
      .map((i) => `  p${i}: ${o.impl(i, k(i), kind(i))},`)
      .join('\n')}\n}`;
    files.push([
      `router/f${f}.ts`,
      `import { t, type S } from '../base';\n${o.routerImports}\n\nexport const f${f} = ${o.file ? o.file(f, routes) : routes};\n`,
    ]);
    const path = o.path?.(f) ?? `f${f}`;
    const call = (i: number) =>
      `client.${path}.p${i}.${kind(i) === 'query' ? 'query' : 'mutate'}({ a_${i}: 'x' })`;
    const tag = (i: number) => o.tag?.(f, k(i)) ?? `E${k(i)}`;
    files.push([
      `consume/f${f}.ts`,
      o.effect
        ? `import { Effect } from 'effect';\nimport { client } from '../client';\n\n${inFile(f)
            .map(
              (i) =>
                `export const r${i}: Effect.Effect<{ v_${i}: string } | null, unknown> = ${call(i)}.pipe(Effect.catchTag('${tag(i)}', () => Effect.succeed(null)));`,
            )
            .join('\n')}\n`
        : `import { matchError, safe } from '${relative(join(dir, 'consume'), join(here, 'shared/client.ts'))}';\nimport { client, ${o.handlers?.(f) ?? 'handlers'} } from '../client';\n\n${inFile(f)
            .map(
              (i) =>
                `const [d${i}, e${i}] = await safe(${call(i)});\nexport const r${i}: string = e${i} ? matchError(e${i}, { ...${o.handlers?.(f) ?? 'handlers'}, ${tag(i)}: (e) => e._tag, unexpected: (e) => e.message }) : d${i}.v_${i};`,
            )
            .join('\n')}\n`,
    ]);
  }
  files.push(['router/index.ts', o.root(ids)]);
  files.push([
    'server.ts',
    `import { createFetchHandler } from '@trpc12/trpc/server';\nimport { router } from './router';\n\nexport const handler = createFetchHandler({ router, createContext: () => ({ user: null })${g.n === 0 ? ' as never' : ''} });\n`,
  ]);
  files.push([
    'client.ts',
    `import { httpLink } from '@trpc12/trpc/client';\nimport { ${o.effect ? 'createEffectClient' : 'createClient'} } from './spike';\nimport type { router } from './router';\n\nexport const client = ${o.effect ? 'createEffectClient' : 'createClient'}<typeof router>({ links: [httpLink({ url: 'http://localhost:3000/trpc' })], registry: {} as never, errors: {} as never } as never);\n${o.handlerDecls(g)}`,
  ]);
  files.push(['tsconfig.server.json', tsconfig(['spike.ts', 'base.ts', 'errors.ts', 'errors', 'router', 'server.ts'])]);
  files.push(['tsconfig.json', tsconfig(['.'])]);
  return files;
};

const thousands = (n: number) => Math.round(n).toLocaleString('en-US');

const bench = Command.make(
  'bench',
  {
    procedures: Flag.Int('procedures').pipe(Flag.withDefault(1500)),
    errors: Flag.Int('errors').pipe(Flag.withDefault(24)),
    runs: Flag.Int('runs').pipe(Flag.withDefault(3)),
    only: Flag.String('only').pipe(Flag.withDefault('')),
  },
  (opts) =>
    Effect.gen(function* () {
      const names = (opts.only === ''
        ? Object.keys(all)
        : opts.only.split(',').map((s) => s.trim())) as ReadonlyArray<Name>;
      const halves = ['tsconfig.server.json', 'tsconfig.json'] as const;
      const measure = (name: Name, n: number) =>
        Effect.gen(function* () {
          const dir = join(here, 'generated', `${name.replace(/ /g, '-')}${n === 0 ? '-empty' : ''}`);
          yield* writeFixture(dir, fixture(name, { n, errors: opts.errors, dir }, dir));
          const out = [];
          for (const project of halves) {
            out.push(yield* medianDiagnostics(join(dir, project), opts.runs));
          }
          return out;
        });
      const lines: Array<Array<string>> = [[], []];
      for (const name of names) {
        const empty = yield* measure(name, 0);
        const full = yield* measure(name, opts.procedures);
        for (const h of [0, 1] as const) {
          const m = full[h]!;
          const own = m('Instantiations') - empty[h]!('Instantiations');
          lines[h]!.push(
            `| ${name} | ${thousands(m('Instantiations'))} | ${thousands(own / opts.procedures)} | ${thousands(m('Types'))} | ${Math.round(m('Memory used') / 1024)} MB | ${m('Check time').toFixed(2)}s |`,
          );
        }
        yield* Console.error(`done: ${name}`);
      }
      const head = '| option | instantiations | per procedure | types | memory | check |\n| --- | ---: | ---: | ---: | ---: | ---: |';
      yield* Console.log(
        `${opts.procedures} procedures, ${opts.errors} registry errors, single-threaded tsc, median of ${opts.runs}\n\nserver\n\n${head}\n${lines[0]!.join('\n')}\n\nwith client\n\n${head}\n${lines[1]!.join('\n')}`,
      );
    }),
);

runScript(import.meta, bench);
