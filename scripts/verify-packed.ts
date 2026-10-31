/**
 * Checks the packed packages the way a consumer sees them. Run after `pnpm build`.
 *
 * - Every `bin`, `exports`, `main`, `module` and `types` target is in the tarball,
 *   and every `bin` has a shebang.
 * - No `catalog:`/`workspace:` specifiers leak into published dependencies.
 * - The tarballs install together with npm, which enforces peer dependencies.
 * - Their declarations type-check with `skipLibCheck: false`, under `nodenext`
 *   (ESM and CJS) and `bundler` resolution, for each supported TypeScript major:
 *   - "core": only @trpc/server and @trpc/client, without any optional peers
 *   - "full": every package, with every optional peer installed
 *
 * The build doesn't fail when a declaration can't resolve a type, it emits `any`.
 * The assertions below catch that for types that have regressed this way before.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

type PackageJson = {
  name: string;
  version: string;
  private?: boolean;
  main?: string;
  module?: string;
  types?: string;
  bin?: string | Record<string, string>;
  exports?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const root = path.join(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trpc-verify-packed-'));
const failures: string[] = [];

function run(cmd: string, args: string[], cwd: string) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}
function listFiles(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(p, base) : [path.relative(base, p)];
  });
}
function collectStrings(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (node && typeof node === 'object')
    return Object.values(node).flatMap(collectStrings);
  return [];
}

// Pack
const tarballDir = path.join(tmp, 'tarballs');
fs.mkdirSync(tarballDir);
const packages = new Map<string, { pkg: PackageJson; tarball: string }>();
for (const dir of fs.readdirSync(path.join(root, 'packages'))) {
  const pkgDir = path.join(root, 'packages', dir);
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) continue;
  const source = JSON.parse(
    fs.readFileSync(pkgJsonPath, 'utf8'),
  ) as PackageJson;
  if (source.private) continue;

  const before = new Set(fs.readdirSync(tarballDir));
  run('pnpm', ['pack', '--pack-destination', tarballDir], pkgDir);
  const tarball = fs.readdirSync(tarballDir).find((f) => !before.has(f));
  if (!tarball)
    throw new Error(`pnpm pack produced no tarball for ${source.name}`);

  const extracted = path.join(tmp, 'extracted', dir);
  fs.mkdirSync(extracted, { recursive: true });
  run('tar', ['-xzf', path.join(tarballDir, tarball), '-C', extracted], root);
  const pkgRoot = path.join(extracted, 'package');
  const pkg = JSON.parse(
    fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'),
  ) as PackageJson;
  packages.set(pkg.name, { pkg, tarball: path.join(tarballDir, tarball) });

  // Every target the manifest points at must be in the tarball
  const files = new Set(listFiles(pkgRoot));
  const bins =
    typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {});
  const targets = new Set([
    ...collectStrings(pkg.exports),
    ...[pkg.main, pkg.module, pkg.types].filter((t): t is string => !!t),
    ...bins,
  ]);
  for (const target of targets) {
    const rel = path.posix.normalize(target);
    if (rel.includes('*')) {
      const re = new RegExp(
        `^${rel
          .split('*')
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.+')}$`,
      );
      if (![...files].some((f) => re.test(f)))
        failures.push(`${pkg.name}: no file matches "${target}"`);
    } else if (!files.has(rel)) {
      failures.push(`${pkg.name}: "${target}" is not in the tarball`);
    }
  }
  for (const bin of bins) {
    const file = path.join(pkgRoot, path.posix.normalize(bin));
    if (
      fs.existsSync(file) &&
      !fs.readFileSync(file, 'utf8').startsWith('#!')
    ) {
      failures.push(`${pkg.name}: bin "${bin}" has no shebang`);
    }
  }
  for (const field of [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const) {
    for (const [dep, spec] of Object.entries(pkg[field] ?? {})) {
      if (/^(catalog|workspace|link|file):/.test(spec))
        failures.push(`${pkg.name}: ${field}.${dep} is "${spec}"`);
    }
  }
  console.log(
    `📦 ${pkg.name}@${pkg.version}: ${targets.size} manifest targets checked`,
  );
}

function getPacked(name: string) {
  const packed = packages.get(name);
  if (!packed) throw new Error(`${name} was not packed`);
  return packed;
}

// Errors we know about and accept for now. Keep each one narrow.
const KNOWN_ISSUES = [
  {
    // `@hey-api/openapi-ts` is ESM-only. TypeScript 5.7 rejects importing its
    // types from CJS declarations; 5.8+ allows it.
    match: /node_modules\/@trpc\/openapi\/dist\/heyapi\/index\.d\.cts.*TS1479/,
    typescript: '5.7.',
  },
];

// Type-check as a consumer
const OPTIONAL_PEERS = [
  '@hey-api/openapi-ts@^0.99.0',
  '@tanstack/react-query@^5.80.3',
  '@types/aws-lambda@^8',
  '@types/express@^5',
  '@types/react@^19',
  '@types/react-dom@^19',
  '@types/ws@^8',
  'fastify@^5',
  'next@^15',
  'react@^19',
  'react-dom@^19',
  'zod@^4',
];
// Server entry points that need an optional peer; the "core" consumer doesn't install those
const ADAPTERS_WITH_OPTIONAL_PEERS = [
  'aws-lambda',
  'express',
  'fastify',
  'next',
  'next-app-dir',
  'ws',
].map((a) => `./adapters/${a}`);

const ASSERTIONS = `
import { initTRPC } from '@trpc/server';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { createTRPCClient, createWSClient, httpBatchLink } from '@trpc/client';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const t = initTRPC.create();
const appRouter = t.router({
  greet: t.procedure.input((v: unknown) => v as { name: string }).query(({ input }) => ({ msg: input.name })),
});
type AppRouter = typeof appRouter;
export type T1 = Expect<Equal<inferRouterOutputs<AppRouter>['greet'], { msg: string }>>;
export type T2 = Expect<Equal<inferRouterInputs<AppRouter>['greet'], { name: string }>>;

const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: 'http://localhost' })] });
export type T3 = Expect<Equal<Awaited<ReturnType<typeof client.greet.query>>, { msg: string }>>;

type WS = ReturnType<typeof createWSClient>;
export type T4 = Expect<Equal<IsAny<ReturnType<WS['request']>>, false>>;
export type T5 = Expect<Equal<IsAny<NonNullable<WS['connection']>['ws']>, false>>;
export type T6 = Expect<Equal<NonNullable<WS['connection']>['id'], number>>;
`;
const FULL_ASSERTIONS = `
import { createTRPCHeyApiClientConfig } from '@trpc/openapi/heyapi';
type IsAnyFull<T> = 0 extends 1 & T ? true : false;
export const heyApiConfigIsTyped: IsAnyFull<ReturnType<typeof createTRPCHeyApiClientConfig>> = false;
`;

const scenarios = [
  {
    name: 'core',
    packages: ['@trpc/server', '@trpc/client'],
    extraDeps: [] as string[],
    typescript: ['5.7.2', '6', '7'],
    skipEntry: (name: string, subpath: string) =>
      name === '@trpc/server' && ADAPTERS_WITH_OPTIONAL_PEERS.includes(subpath),
    assertions: ASSERTIONS,
  },
  {
    name: 'full',
    // @trpc/upgrade is a CLI and ships no declarations
    packages: [...packages.keys()].filter((name) => name !== '@trpc/upgrade'),
    extraDeps: OPTIONAL_PEERS,
    // @trpc/openapi supports typescript <7
    typescript: ['5.7.2', '6'],
    skipEntry: () => false,
    assertions: ASSERTIONS + FULL_ASSERTIONS,
  },
];

const COMPILER_OPTIONS = {
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  target: 'es2022',
  lib: ['es2023', 'dom', 'dom.iterable'],
  types: ['node'],
  jsx: 'react-jsx',
};

for (const scenario of scenarios) {
  const dir = path.join(tmp, `consumer-${scenario.name}`);
  fs.mkdirSync(dir);
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: `consumer-${scenario.name}`,
      private: true,
      type: 'module',
    }),
  );
  const tarballs = scenario.packages.map((name) => getPacked(name).tarball);
  try {
    run(
      'npm',
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
        '--loglevel=error',
        ...tarballs,
        ...scenario.extraDeps,
        '@types/node@^24',
        `typescript@${scenario.typescript[0]}`,
      ],
      dir,
    );
  } catch (err) {
    failures.push(
      `[${scenario.name}] npm install failed:\n${(err as { stderr?: string }).stderr ?? err}`,
    );
    continue;
  }

  const imports = scenario.packages.flatMap((name, i) =>
    Object.keys((getPacked(name).pkg.exports ?? {}) as Record<string, unknown>)
      .filter(
        (subpath) =>
          subpath !== './package.json' &&
          !subpath.includes('*') &&
          !scenario.skipEntry(name, subpath),
      )
      .map(
        (subpath, j) =>
          `import type * as m${i}_${j} from '${name}${subpath.slice(1)}';`,
      ),
  );
  const entries = `${imports.join('\n')}\nexport {};\n`;
  fs.writeFileSync(path.join(dir, 'entries.mts'), entries);
  fs.writeFileSync(path.join(dir, 'entries.cts'), entries);
  fs.writeFileSync(path.join(dir, 'entries.ts'), entries);
  fs.writeFileSync(path.join(dir, 'assertions.mts'), scenario.assertions);
  fs.writeFileSync(path.join(dir, 'assertions.cts'), scenario.assertions);
  fs.writeFileSync(path.join(dir, 'assertions.ts'), scenario.assertions);
  const configs = {
    nodenext: {
      module: 'nodenext',
      moduleResolution: 'nodenext',
      files: ['entries.mts', 'entries.cts', 'assertions.mts', 'assertions.cts'],
    },
    bundler: {
      module: 'esnext',
      moduleResolution: 'bundler',
      files: ['entries.ts', 'assertions.ts'],
    },
  };
  for (const [mode, { files, ...options }] of Object.entries(configs)) {
    fs.writeFileSync(
      path.join(dir, `tsconfig.${mode}.json`),
      JSON.stringify(
        { compilerOptions: { ...COMPILER_OPTIONS, ...options }, files },
        null,
        2,
      ),
    );
  }

  for (const version of scenario.typescript) {
    if (version !== scenario.typescript[0])
      run(
        'npm',
        [
          'install',
          '--no-audit',
          '--no-fund',
          '--loglevel=error',
          `typescript@${version}`,
        ],
        dir,
      );
    const actual = JSON.parse(
      fs.readFileSync(
        path.join(dir, 'node_modules/typescript/package.json'),
        'utf8',
      ),
    ).version;
    for (const mode of Object.keys(configs)) {
      let output = '';
      try {
        output = run('npx', ['tsc', '-p', `tsconfig.${mode}.json`], dir);
      } catch (err) {
        output = (err as { stdout?: string }).stdout ?? String(err);
      }
      const errors = output
        .split('\n')
        .filter((line) => /error TS\d+/.test(line));
      // Only our declarations and the consumer files are ours to fix
      const ours = errors.filter(
        (line) =>
          !line.startsWith('node_modules/') ||
          line.startsWith('node_modules/@trpc/'),
      );
      const known = ours.filter((line) =>
        KNOWN_ISSUES.some(
          (issue) =>
            issue.match.test(line) && actual.startsWith(issue.typescript),
        ),
      );
      const unexpected = ours.filter((line) => !known.includes(line));
      const label = `[${scenario.name}] typescript@${actual} ${mode}`;
      console.log(
        `${unexpected.length ? '❌' : known.length ? '⚠️ ' : '✅'} ${label}: ${imports.length} entry points, ${unexpected.length} errors${known.length ? `, ${known.length} known` : ''}${errors.length > ours.length ? ` (+${errors.length - ours.length} in third-party declarations)` : ''}`,
      );
      failures.push(...unexpected.map((line) => `${label}: ${line}`));
    }
  }
}

if (failures.length) {
  console.error(
    `\n${failures.length} problem(s):\n${failures.map((f) => `  - ${f}`).join('\n')}`,
  );
  process.exit(1);
}
console.log('\nAll packed packages verified');
fs.rmSync(tmp, { recursive: true, force: true });
