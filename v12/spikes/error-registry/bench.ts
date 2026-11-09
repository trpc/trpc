/**
 * `node error-registry/bench.ts [--procedures 1500] [--errors 24] [--runs 3]
 * [--only a,b]` from `spikes/`: what each registry option costs to
 * type-check, the way `pnpm bench shapes` measures v12 (`pnpm build`
 * first: v12 is read from its `.d.ts`).
 *
 * Each option writes a project of `procedures` procedures (files of 10,
 * half queries and half mutations), each returning one of `errors` errors
 * (half with `data`), and a client file per router file calling each
 * procedure through `safe()` and an exhaustive `matchError()` over that
 * call's own union. The client is the shared one, typed from the router
 * alone; `today` is v12 as it is (`.errors()` per procedure, v12's client
 * and `matchError()`). `merge-errors` declares a module's registry on its
 * base procedure, so its calls handle the module's errors (a spread object
 * per module, one handler overridden); `… declared` declares the whole
 * registry on every procedure. `… effect` calls through the Effect client
 * with one `catchTag` instead. Each project is checked with tsc 7.1
 * (`--singleThreaded`) twice: the server half, then with the client.
 * "per procedure" subtracts the same project with no procedures.
 */
import { Console, Effect } from 'effect';
import { Command, Flag } from 'effect/cli';
import { join, relative } from 'node:path';
import {
  medianDiagnostics,
  runScript,
  writeFixture,
  type Files,
} from '../kit.ts';

const PER_FILE = 10;
const MODULES = 3;
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
  readonly module?: string;
  /** `errors.ts` (and any module files), importing the spike as `./spike.ts`. */
  readonly errorFiles: (g: Gen) => Files;
  /** A router file's imports, from `router/`. */
  readonly routerImports: (f: number) => string;
  /** Procedure `i` of file `f` returning error `k`; `kind` its terminal. */
  readonly impl: (
    i: number,
    k: number,
    kind: string,
    f: number,
    g: Gen,
  ) => string;
  /** The tag of error `k` in file `f`. */
  readonly tag?: (f: number, k: number, g: Gen) => string;
  /** The `matchError()` handlers of a call in file `f` failing with `tag`. */
  readonly handlers?: (f: number, tag: string) => string;
  /** `client.ts`'s handler objects. */
  readonly handlerDecls?: (g: Gen) => string;
  readonly client: 'spike' | 'effect' | 'v12';
}

const data = (k: number) => k % 2 === 0;
const status = (k: number) => 400 + (k % 30);
const spec = (k: number, name = `E${k}`) =>
  `{ status: ${status(k)}${data(k) ? `, data: {} as S<{ ${name}_id: string }>` : ''} }`;
const args = (k: number, name = `E${k}`) =>
  data(k) ? `{ ${name}_id: 'x' }` : '';
const ok = (i: number) => `{ v_${i}: opts.input.a_${i} }`;
const returns = (i: number, error: string) =>
  `(opts) => opts.input.a_${i} === '' ? ${error} : ${ok(i)}`;
const input = (i: number) => `.input({} as S<{ a_${i}: string }>)`;
const tags = (g: Gen) => Array.from({ length: g.errors }, (_, k) => `E${k}`);
const linkHandlers =
  "NetworkError: () => 'offline', BadResponse: (e: { message: string }) => e.message";
const unexpected = 'unexpected: (e: { message: string }) => e.message';
const perCall = (_f: number, tag: string) =>
  `{ ${tag}: (e) => e._tag, ${linkHandlers}, ${unexpected} }`;
const handlerObject = (names: ReadonlyArray<string>) =>
  `{ ${names.map((n) => `${n}: (e: { message: string }) => e.message`).join(', ')}, ${linkHandlers}, ${unexpected} }`;

const errorsObject = (g: Gen) =>
  `{\n${tags(g)
    .map((tag, k) => `  ${tag}: ${spec(k)},`)
    .join('\n')}\n}`;

const fromRegistry = (i: number, k: number, kind: string) =>
  `t.procedure${input(i)}.${kind}(${returns(i, `errors.E${k}(${args(k)})`)})`;

/** The modules of E: error `k` of file `f` is module `f % 3`'s `k % per`. */
const perModule = (g: Gen) => Math.ceil(g.errors / MODULES);
const modTag = (m: number, k: number) => `M${'abc'[m]}${k}`;

const options = {
  today: {
    errorFiles: () => [],
    routerImports: () => '',
    impl: (i, k, kind) =>
      `t.procedure.errors({ E${k}: ${spec(k)} })${input(i)}.${kind}(${returns(i, `opts.errors.E${k}(${data(k) ? `{ data: ${args(k)} }` : ''})`)})`,
    handlers: (_f, tag) =>
      `{ ${tag}: (e) => e.code, BAD_REQUEST: (e) => e.message, NETWORK_ERROR: () => 'offline', BAD_RESPONSE: (e) => e.message, ${unexpected} }`,
    client: 'v12',
  },
  'create-errors': {
    module: 'create-errors/create-errors.ts',
    errorFiles: (g) => [
      [
        'errors.ts',
        `import { createErrors } from './spike';\nimport type { S } from './base';\n\nexport const errors = createErrors(${errorsObject(g)});\n`,
      ],
    ],
    routerImports: () => `import { errors } from '../errors';`,
    impl: fromRegistry,
    client: 'spike',
  },
  'create-errors declared': {
    module: 'create-errors/create-errors.ts',
    errorFiles: (g) => [
      [
        'errors.ts',
        `import { createErrors } from './spike';\nimport { t, type S } from './base';\n\nexport const errors = createErrors(${errorsObject(g)});\nexport const procedure = t.procedure.errors(errors);\n`,
      ],
    ],
    routerImports: () => `import { errors, procedure } from '../errors';`,
    impl: (i, k, kind) =>
      `procedure${input(i)}.${kind}(${returns(i, `errors.E${k}(${args(k)})`)})`,
    handlers: (_f, tag) => `{ ...c.handlers, ${tag}: (e) => e._tag }`,
    handlerDecls: (g) => `export const handlers = ${handlerObject(tags(g))};\n`,
    client: 'spike',
  },
  'tagged-classes': {
    module: 'tagged-classes/tagged-classes.ts',
    errorFiles: (g) => [
      [
        'errors.ts',
        `import { Schema } from 'effect';\nimport { taggedErrors } from './spike';\n\n${tags(
          g,
        )
          .map(
            (tag, k) =>
              `export class ${tag} extends Schema.TaggedError<${tag}>()('${tag}', { ${data(k) ? `${tag}_id: Schema.String` : ''} }, { httpApiStatus: ${status(k)} }) {}`,
          )
          .join(
            '\n',
          )}\n\nexport const errors = taggedErrors(${tags(g).join(', ')});\n`,
      ],
    ],
    routerImports: () => `import * as e from '../errors';`,
    impl: (i, k, kind) =>
      `t.procedure${input(i)}.${kind}(${returns(i, `e.errors.send(new e.E${k}(${args(k)}))`)})`,
    client: 'spike',
  },
  builder: {
    module: 'builder/builder.ts',
    errorFiles: (g) => [
      [
        'errors.ts',
        `import { errors as registry } from './spike';\nimport type { S } from './base';\n\nexport const errors = registry()\n${tags(
          g,
        )
          .map((tag, k) => `  .add('${tag}', ${spec(k)})`)
          .join('\n')};\n`,
      ],
    ],
    routerImports: () => `import { errors } from '../errors';`,
    impl: fromRegistry,
    client: 'spike',
  },
  'merge-errors': {
    module: 'merge-errors/merge-errors.ts',
    errorFiles: (g) => {
      const per = perModule(g);
      const mod = (m: number): readonly [string, string] => [
        `errors/m${m}.ts`,
        `import { createErrors } from '../spike';\nimport { t, type S } from '../base';\n\nexport const m${m} = createErrors({\n${Array.from({ length: per }, (_, k) => `  ${modTag(m, k)}: ${spec(k, modTag(m, k))},`).join('\n')}\n});\nexport const p${m} = t.procedure.errors(m${m});\n`,
      ];
      return [
        ...Array.from({ length: MODULES }, (_, m) => mod(m)),
        [
          'errors/index.ts',
          `import { mergeErrors } from '../spike';\n${Array.from({ length: MODULES }, (_, m) => `import { m${m}, p${m} } from './m${m}';`).join('\n')}\n\nexport { ${Array.from({ length: MODULES }, (_, m) => `m${m}, p${m}`).join(', ')} };\nexport const errors = mergeErrors(${Array.from({ length: MODULES }, (_, m) => `m${m}`).join(', ')});\n`,
        ],
      ];
    },
    routerImports: (f) =>
      `import { m${f % MODULES} as m, p${f % MODULES} as procedure } from '../errors/index';`,
    impl: (i, k, kind, f, g) => {
      const j = k % perModule(g);
      const tag = modTag(f % MODULES, j);
      return `procedure${input(i)}.${kind}(${returns(i, `m.${tag}(${args(j, tag)})`)})`;
    },
    tag: (f, k, g) => modTag(f % MODULES, k % perModule(g)),
    handlers: (f, tag) =>
      `{ ...c.handlers${f % MODULES}, ${tag}: (e) => e._tag }`,
    handlerDecls: (g) =>
      Array.from(
        { length: MODULES },
        (_, m) =>
          `export const handlers${m} = ${handlerObject(
            Array.from({ length: perModule(g) }, (_, k) => modTag(m, k)),
          )};`,
      ).join('\n'),
    client: 'spike',
  },
  inferred: {
    module: 'inferred/inferred.ts',
    errorFiles: (g) => [
      [
        'errors.ts',
        `import { defineError } from './spike';\nimport type { S } from './base';\n\n${tags(
          g,
        )
          .map(
            (tag, k) =>
              `export const ${tag} = defineError('${tag}', ${spec(k)});`,
          )
          .join('\n')}\n`,
      ],
    ],
    routerImports: () => `import * as errors from '../errors';`,
    impl: fromRegistry,
    client: 'spike',
  },
} satisfies Record<string, Option>;

const all = {
  ...options,
  'create-errors effect': {
    ...options['create-errors'],
    client: 'effect',
  } satisfies Option,
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

const clientFile = (o: Option, g: Gen, sharedClient: string) => {
  const link = `links: [httpLink({ url: 'http://localhost:3000/trpc' })]`;
  const make =
    o.client === 'v12'
      ? `import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';\nimport type { router } from './router';\n\nexport const client = createTrpcClient({ router: routerType<typeof router>(), ${link} });\n`
      : `import { httpLink } from '@trpc12/trpc/client';\nimport { ${o.client === 'effect' ? 'createEffectClient as create' : 'createClient as create'} } from '${sharedClient}';\nimport type { router } from './router';\n\nexport const client = create<typeof router>({ ${link} });\n`;
  return `${make}${o.handlerDecls?.(g) ?? ''}`;
};

const fixture = (name: Name, g: Gen, dir: string): Files => {
  const o: Option = all[name];
  const sharedClient = relative(dir, join(here, 'shared/client.ts'));
  const files: Array<readonly [string, string]> = [
    [
      'spike.ts',
      o.module
        ? `export * from '${relative(dir, join(here, o.module))}';\n`
        : 'export {};\n',
    ],
    [
      'base.ts',
      `import { initTrpc, type StandardSchemaV1 } from '@trpc12/trpc/server';\n\nexport type S<T> = StandardSchemaV1<T, T>;\nexport const t = initTrpc<{ ctx: { user: string | null } }>({ warnThrownErrors: false });\n`,
    ],
    ...o.errorFiles(g),
  ];
  const ids = Array.from({ length: Math.ceil(g.n / PER_FILE) }, (_, f) => f);
  const inFile = (f: number) =>
    Array.from(
      { length: Math.min(PER_FILE, g.n - f * PER_FILE) },
      (_, p) => f * PER_FILE + p,
    );
  const kind = (i: number) => (i % 2 === 0 ? 'query' : 'mutation');
  const k = (i: number) => i % g.errors;
  for (const f of ids) {
    const routes = `{\n${inFile(f)
      .map((i) => `  p${i}: ${o.impl(i, k(i), kind(i), f, g)},`)
      .join('\n')}\n}`;
    files.push([
      `router/f${f}.ts`,
      `import { t, type S } from '../base';\n${o.routerImports(f)}\n\nexport const f${f} = t.router(${routes});\n`,
    ]);
    const call = (i: number) =>
      `c.client.f${f}.p${i}.${kind(i) === 'query' ? 'query' : 'mutate'}({ a_${i}: 'x' })`;
    const tag = (i: number) => o.tag?.(f, k(i), g) ?? `E${k(i)}`;
    const handlers = (i: number) => (o.handlers ?? perCall)(f, tag(i));
    const consumer = relative(
      join(dir, 'consume'),
      join(here, 'shared/client.ts'),
    );
    files.push([
      `consume/f${f}.ts`,
      o.client === 'effect'
        ? `import { Effect } from 'effect';\nimport * as c from '../client';\n\n${inFile(
            f,
          )
            .map(
              (i) =>
                `export const r${i}: Effect.Effect<{ v_${i}: string } | null, unknown> = ${call(i)}.pipe(Effect.catchTag('${tag(i)}', () => Effect.succeed(null)));`,
            )
            .join('\n')}\n`
        : `import { matchError, safe } from '${o.client === 'v12' ? '@trpc12/trpc/client' : consumer}';\nimport * as c from '../client';\n\n${inFile(
            f,
          )
            .map(
              (i) =>
                `const [d${i}, e${i}] = await safe(${call(i)});\nexport const r${i}: string = e${i} ? matchError(e${i}, ${handlers(i)}) : d${i}.v_${i};`,
            )
            .join('\n')}\n`,
    ]);
  }
  files.push([
    'router/index.ts',
    `import { t } from '../base';\n${ids.map((f) => `import { f${f} } from './f${f}';`).join('\n')}\n\nexport const router = t.router({\n${ids.map((f) => `  f${f},`).join('\n')}\n});\n`,
  ]);
  files.push([
    'server.ts',
    `import { createFetchHandler } from '@trpc12/trpc/server';\nimport { router } from './router';\n\nexport const handler = createFetchHandler({ router, createContext: () => ({ user: null })${g.n === 0 ? ' as never' : ''} });\n`,
  ]);
  files.push(['client.ts', clientFile(o, g, sharedClient)]);
  files.push([
    'tsconfig.server.json',
    tsconfig([
      'spike.ts',
      'base.ts',
      'errors.ts',
      'errors',
      'router',
      'server.ts',
    ]),
  ]);
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
      const names = (
        opts.only === ''
          ? Object.keys(all)
          : opts.only.split(',').map((s) => s.trim())
      ) as ReadonlyArray<Name>;
      const halves = ['tsconfig.server.json', 'tsconfig.json'] as const;
      const measure = (name: Name, n: number) =>
        Effect.gen(function* () {
          const dir = join(
            here,
            'generated',
            `${name.replace(/ /g, '-')}${n === 0 ? '-empty' : ''}`,
          );
          yield* writeFixture(
            dir,
            fixture(name, { n, errors: opts.errors, dir }, dir),
          );
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
      const head =
        '| option | instantiations | per procedure | types | memory | check |\n| --- | ---: | ---: | ---: | ---: | ---: |';
      yield* Console.log(
        `${opts.procedures} procedures, ${opts.errors} errors, single-threaded tsc, median of ${opts.runs}\n\nserver\n\n${head}\n${lines[0]!.join('\n')}\n\nwith client\n\n${head}\n${lines[1]!.join('\n')}`,
      );
    }),
);

runScript(import.meta, bench);
