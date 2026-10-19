/**
 * `pnpm bench shapes [--procedures 1500] [--runs 3] [--only plain,errors]`:
 * what each way of writing a procedure costs to type-check, at scale.
 *
 * Every shape writes a project of `procedures` procedures (files of 10,
 * half queries and half mutations, every field name unique so nothing is
 * shared), a fetch handler over the router, and a client file per router
 * file that calls each procedure with its result annotated (`match`: through
 * `safe()` and an exhaustive `matchError()`; `links`: through an app's
 * chain of links, passing call options). Each project is
 * checked twice with tsc 7 (`--singleThreaded`, v12 from its `.d.ts`): the
 * server half alone (routers and handler), then with the client calls.
 * "per procedure" subtracts a project with an empty router.
 */
import { Console, Effect } from 'effect';
import { Command, Flag } from 'effect/cli';
import {
  BenchFailed,
  fixtureTsconfig,
  generated,
  medianDiagnostics,
  requireDist,
  table,
  thousands,
  writeFiles,
} from './kit.ts';

const PER_FILE = 10;

const body = (i: number, notFound: string) =>
  `(opts) => opts.input.a_${i} === '' ? ${notFound} : { v_${i}: opts.input.a_${i} }`;
const input = (i: number) => `.input({} as S<{ a_${i}: string }>)`;
const output = (i: number) => `.output({} as S<{ v_${i}: string }>)`;
const errors = (i: number) =>
  `.errors({ NOT_FOUND: {}, CONFLICT: { data: {} as S<{ id_${i}: string }> } })`;
const returned = `error({ code: 'NOT_FOUND' })`;
const declared = `opts.errors.NOT_FOUND()`;

interface Shape {
  /** The procedure, `kind` its terminal. */
  readonly impl: (i: number, kind: string) => string;
  /** For `contract`: the contract procedure the impl implements. */
  readonly contract?: (i: number, kind: string) => string;
  /** The client's use of procedure `i`, `call` its call; annotated by default. */
  readonly consume?: (i: number, call: string) => string;
  /** The client's `links`, with their imports; one `httpLink` by default. */
  readonly links?: { readonly imports: string; readonly links: string };
  /** The call options each call passes. */
  readonly callOptions?: string;
}

/** A chain like an app's: every built-in kind of link, and a custom one. */
const appLinks = {
  imports: `import { Schema, Stream } from 'effect';
import { dedupeLink, link, loggerLink, retryLink, splitLink, TrpcError, wsLink } from '@trpc12/trpc/client';

class RateLimited extends TrpcError.Tagged('RATE_LIMITED', {
  status: 429,
  data: Schema.Struct({ retryAfter: Schema.Number }),
}) {}
const tenantLink = link<{ context: { tenant?: string }; errors: RateLimited }>((opts) =>
  opts.op.context.tenant === '' ? Stream.fail(new RateLimited({ retryAfter: 1 })) : opts.next(opts.op),
);
`,
  links: `[
    loggerLink(),
    retryLink(),
    dedupeLink(),
    tenantLink,
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ url: 'ws://localhost:3000/trpc' }),
      false: httpLink({ url: 'http://localhost:3000/trpc', batch: true }),
    }),
  ]`,
};

/** `match`'s handlers: the procedure's codes, `httpLink`'s, and the rest. */
const handlers = [
  'NOT_FOUND: (e) => e.code',
  'BAD_REQUEST: (e) => e.message',
  "NETWORK_ERROR: () => 'offline'",
  'BAD_RESPONSE: (e) => e.message',
  'STREAM_INTERRUPTED: (e) => e.message',
  'unexpected: (e) => e.message',
].join(', ');

/** The shapes, by name; each procedure returns `{ v_i }` or a `NOT_FOUND`. */
const shapeList = {
  plain: {
    impl: (i, kind) => `t.procedure${input(i)}.${kind}(${body(i, returned)})`,
  },
  output: {
    impl: (i, kind) =>
      `t.procedure${input(i)}${output(i)}.${kind}(${body(i, returned)})`,
  },
  errors: {
    impl: (i, kind) =>
      `t.procedure${input(i)}${errors(i)}.${kind}(${body(i, declared)})`,
  },
  'errors+output': {
    impl: (i, kind) =>
      `t.procedure${input(i)}${output(i)}${errors(i)}.${kind}(${body(i, declared)})`,
  },
  middleware: {
    // A base of three ctx-adding middlewares, plus one of its own.
    impl: (i, kind) =>
      `authed.use((opts) => opts.next({ ctx: { perm_${i}: true } }))${input(i)}.${kind}((opts) => opts.input.a_${i} === '' ? ${returned} : { v_${i}: opts.ctx.user.id + opts.ctx.tenant })`,
  },
  effect: {
    impl: (i, kind) =>
      `t.procedure${input(i)}.${kind}((opts) => Effect.gen(function* () {
    if (opts.input.a_${i} === '') return yield* ${returned};
    return { v_${i}: opts.input.a_${i} };
  }))`,
  },
  contract: {
    contract: (i, kind) => `c${input(i)}${output(i)}${errors(i)}.${kind}()`,
    impl: (i, kind) => `.${kind}(${body(i, declared)})`,
  },
  match: {
    // `plain`, each call through `safe()` and `matchError()`.
    impl: (i, kind) => `t.procedure${input(i)}.${kind}(${body(i, returned)})`,
    consume: (i, call) =>
      `const [d${i}, e${i}] = await safe(${call});\nexport const r${i}: string = e${i} ? matchError(e${i}, { ${handlers} }) : d${i}.v_${i};`,
  },
  links: {
    // `plain`, through the chain in `appLinks`, each call passing options.
    impl: (i, kind) => `t.procedure${input(i)}.${kind}(${body(i, returned)})`,
    links: appLinks,
    callOptions: `{ tenant: 't', dedupe: false, headers: { 'x-a': '1' } }`,
  },
} satisfies Record<string, Shape>;

type ShapeName = keyof typeof shapeList;
const shapeNames = Object.keys(shapeList) as ReadonlyArray<ShapeName>;

const base = `import { experimental_contract } from '@trpc12/trpc/contract';
import { error, initTrpc } from '@trpc12/trpc/server';
import type { StandardSchemaV1 } from '@standard-schema/spec';

export { error };
export type S<T> = StandardSchemaV1<T, T>;
export interface Context {
  user: { id: string } | null;
}
export const t = initTrpc<{ ctx: Context }>();
export const c = experimental_contract.create();

export const authed = t.procedure
  .use((opts) =>
    opts.ctx.user
      ? opts.next({ ctx: { user: opts.ctx.user } })
      : error({ code: 'UNAUTHORIZED' }),
  )
  .use((opts) => opts.next({ ctx: { tenant: 'acme' } }))
  .use((opts) => opts.next({ ctx: { requestId: 'r' } }));
`;

const fixture = (
  name: ShapeName | 'empty',
  procedures: number,
): Array<[string, string]> => {
  const shape: Shape | undefined =
    name === 'empty' ? undefined : shapeList[name];
  const files: Array<[string, string]> = [['base.ts', base]];
  const fileCount = Math.ceil(procedures / PER_FILE);
  const ids = Array.from({ length: fileCount }, (_, f) => f);
  const inFile = (f: number) =>
    Array.from(
      { length: Math.min(PER_FILE, procedures - f * PER_FILE) },
      (_, p) => f * PER_FILE + p,
    );
  const kind = (i: number) => (i % 2 === 0 ? 'query' : 'mutation');
  const contract = shape?.contract;

  for (const f of ids) {
    if (contract) {
      files.push([
        `contract/f${f}.ts`,
        `import { c, type S } from '../base';\n\nexport const f${f} = {\n${inFile(
          f,
        )
          .map((i) => `  p${i}: ${contract(i, kind(i))},`)
          .join('\n')}\n};\n`,
      ]);
    }
    files.push([
      `router/f${f}.ts`,
      contract
        ? `import { impl } from './impl';\n\nexport const f${f} = {\n${inFile(f)
            .map((i) => `  p${i}: impl.f${f}.p${i}${shape!.impl(i, kind(i))},`)
            .join('\n')}\n};\n`
        : `import { Effect } from 'effect';\nimport { authed, error, t, type S } from '../base';\n\nexport const f${f} = {\n${inFile(
            f,
          )
            .map((i) => `  p${i}: ${shape!.impl(i, kind(i))},`)
            .join('\n')}\n};\n`,
    ]);
    const callOptions = shape?.callOptions ? `, ${shape.callOptions}` : '';
    const call = (i: number) =>
      `client.f${f}.p${i}.${kind(i) === 'query' ? 'query' : 'mutate'}({ a_${i}: 'x' }${callOptions})`;
    files.push([
      `consume/f${f}.ts`,
      `${shape?.consume ? "import { matchError, safe } from '@trpc12/trpc/client';\n" : ''}import { client } from '../client';\n\n${inFile(
        f,
      )
        .map((i) =>
          shape?.consume
            ? shape.consume(i, call(i))
            : `export const r${i}: { v_${i}: string } = await ${call(i)};`,
        )
        .join('\n')}\n`,
    ]);
  }

  const imports = ids.map((f) => `import { f${f} } from './f${f}';`).join('\n');
  const entries = ids.map((f) => `  f${f},`).join('\n');
  if (contract) {
    files.push([
      'contract/index.ts',
      `${imports}\n\nexport const contract = {\n${entries}\n};\n`,
    ]);
    files.push([
      'router/impl.ts',
      `import { contract } from '../contract';\nimport { t } from '../base';\n\nexport const impl = t.implement(contract);\n`,
    ]);
    files.push([
      'router/index.ts',
      `import { impl } from './impl';\n${imports}\n\nexport const router = impl.router({\n${entries}\n});\n`,
    ]);
  } else {
    files.push([
      'router/index.ts',
      `${imports}\n\nexport const router = {\n${entries}\n};\n`,
    ]);
  }
  files.push([
    'server.ts',
    `import { createFetchHandler } from '@trpc12/trpc/server';\nimport { router } from './router';\n\nexport const handler = createFetchHandler({\n  router,\n  createContext: () => ({ user: null }),\n});\n`,
  ]);
  const links = shape?.links ?? {
    imports: '',
    links: `[httpLink({ url: 'http://localhost:3000/trpc' })]`,
  };
  files.push([
    'client.ts',
    `import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';\n${links.imports}import type { router } from './router';\n\nexport const client = createTrpcClient({\n  router: routerType<typeof router>(),\n  links: ${links.links},\n});\n`,
  ]);
  files.push([
    'tsconfig.server.json',
    fixtureTsconfig(['base.ts', 'contract', 'router', 'server.ts']),
  ]);
  files.push(['tsconfig.json', fixtureTsconfig(['.'])]);
  return files;
};

const parseOnly = (only: string) =>
  Effect.gen(function* () {
    if (only === '') return shapeNames;
    const picked = only.split(',').map((s) => s.trim());
    const unknown = picked.filter((s) => !shapeNames.includes(s as ShapeName));
    if (unknown.length > 0) {
      return yield* new BenchFailed({
        step: 'shapes',
        cause: `unknown shapes ${unknown.join(', ')}; known: ${shapeNames.join(', ')}`,
      });
    }
    return picked as ReadonlyArray<ShapeName>;
  });

export const shapes = Command.make(
  'shapes',
  {
    procedures: Flag.Int('procedures').pipe(Flag.withDefault(1500)),
    runs: Flag.Int('runs').pipe(Flag.withDefault(3)),
    only: Flag.String('only').pipe(Flag.withDefault('')),
  },
  (opts) =>
    Effect.gen(function* () {
      yield* requireDist;
      const picked = yield* parseOnly(opts.only);
      const halves = [
        ['server', 'tsconfig.server.json'],
        ['with client', 'tsconfig.json'],
      ] as const;
      const measure = (name: ShapeName | 'empty', procedures: number) =>
        Effect.gen(function* () {
          const dir = `${generated}/shapes-${name.replace('+', '-')}`;
          yield* writeFiles(dir, fixture(name, procedures));
          const out = [];
          for (const [, project] of halves) {
            out.push(yield* medianDiagnostics(`${dir}/${project}`, opts.runs));
          }
          return out;
        });
      const empty = yield* measure('empty', 0);
      const rows = halves.map((): string[][] => []);
      let plain: ReadonlyArray<number> | undefined;
      for (const name of picked) {
        const result = yield* measure(name, opts.procedures);
        const inst = result.map((m) => m('Instantiations'));
        if (name === 'plain') plain = inst;
        for (const [h, m] of result.entries()) {
          const own = inst[h]! - empty[h]!('Instantiations');
          rows[h]!.push([
            name,
            thousands(inst[h]!),
            thousands(own / opts.procedures),
            plain ? `${((inst[h]! / plain[h]! - 1) * 100).toFixed(0)}%` : '',
            thousands(m('Types')),
            `${Math.round(m('Memory used') / 1024)} MB`,
            `${m('Check time').toFixed(2)}s`,
          ]);
        }
        yield* Console.error(`done: ${name}`);
      }
      const head = [
        '',
        'instantiations',
        'per procedure',
        'vs plain',
        'types',
        'memory',
        'check',
      ];
      yield* Console.log(
        `${opts.procedures} procedures per shape, single-threaded tsc, median of ${opts.runs}\n\n` +
          halves
            .map(
              ([label], h) =>
                `${label} (empty router: ${thousands(empty[h]!('Instantiations'))} instantiations)\n\n${table(head, rows[h]!)}`,
            )
            .join('\n\n'),
      );
    }),
);
