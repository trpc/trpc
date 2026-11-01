/**
 * Writes `generated/<variant>-<n>/` on the shipped `@trpc12/trpc`: 20 services,
 * `n` Effect procedures (10 per file) that each use one or two of them, a
 * third of them behind an auth middleware that provides `CurrentUser`, a
 * router, and a fetch handler whose `layer` is checked.
 *
 * - `inferred`: today. Services are inferred into the router type; the
 *   handler's `layer` provides all 20, and the middleware is inline.
 * - `provide-layer`: P1. One base procedure provides the 20 services' layer;
 *   the router needs nothing and the handler takes no `layer`.
 * - `middleware-service`: P2. The auth middleware is a service (`useService`),
 *   implemented by a layer the handler gets.
 * - `output`: `inferred`, plus `.output(Schema)` on every procedure.
 * - `declared`: `output`, plus `.errors()` on every procedure.
 * - `strict`: P3. `declared`, with `strict()` checking each resolver against
 *   its declared output and errors.
 * - `contract`: P4. A contract declares every procedure's output and errors;
 *   `t.implement()` checks the resolvers against it.
 */
import { join } from 'node:path';
import { writeFixture, type Files } from '../kit.ts';

export const variants = [
  'inferred',
  'provide-layer',
  'middleware-service',
  'output',
  'declared',
  'strict',
  'contract',
] as const;
export type Variant = (typeof variants)[number];

const PER_FILE = 10;
const SERVICES = 20;
const svc = (i: number) => `S${i % SERVICES}`;
const names = Array.from({ length: SERVICES }, (_, i) => `S${i}`);

const declares = (v: Variant) =>
  v === 'output' || v === 'declared' || v === 'strict';

/** The procedure's output schema, for the variants that declare it. */
function schema(i: number): string {
  switch (i % 3) {
    case 0:
      return 'Schema.String';
    case 1:
      return `Schema.Struct({ a${i}: Schema.String, b: Schema.String })`;
    default:
      return `Schema.Struct({ u${i}: Schema.String, v: Schema.String })`;
  }
}

const errors = `{ NOT_FOUND: { data: Schema.Struct({ id: Schema.String }) } }`;

function resolver(i: number): string {
  switch (i % 3) {
    case 0:
      return `() => ${svc(i)}.use((s) => s.get(${i}))`;
    case 1:
      return `() =>
    Effect.gen(function* () {
      const a = yield* ${svc(i)};
      const b = yield* ${svc(i + 7)};
      return { a${i}: yield* a.get(${i}), b: yield* b.get(${i}) };
    })`;
    default:
      return `() =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      const s = yield* ${svc(i)};
      return { u${i}: user.id, v: yield* s.get(${i}) };
    })`;
  }
}

/** The builder a procedure starts from. */
function base(variant: Variant, i: number): string {
  const authed = i % 3 === 2;
  if (variant === 'contract') {
    return `impl.r${Math.floor(i / PER_FILE)}.p${i % PER_FILE}${authed ? '.use(auth)' : ''}`;
  }
  const root = variant === 'provide-layer' ? 'base' : 't.procedure';
  if (!authed) return root;
  return variant === 'middleware-service' ? 'authed' : `${root}.use(auth)`;
}

function procedure(variant: Variant, i: number): string {
  let builder = base(variant, i);
  if (declares(variant)) {
    builder = `${builder}.output(${schema(i)})`;
    if (variant !== 'output') builder = `${builder}.errors(${errors})`;
  }
  if (variant === 'strict') builder = `strict(${builder})`;
  return `${builder}.query(${resolver(i)})`;
}

/** The fixture's files, by path in its directory. */
export function fixture(variant: Variant, n: number): Files {
  const out: Array<readonly [string, string]> = [];
  const write = (file: string, contents: string) => {
    out.push([file, contents]);
  };
  const files = Math.ceil(n / PER_FILE);
  const indices = (f: number) =>
    Array.from(
      { length: Math.min(PER_FILE, n - f * PER_FILE) },
      (_, p) => f * PER_FILE + p,
    );

  write(
    'services.ts',
    `import { Context, Effect, Layer } from 'effect';
import type { MiddlewareImpl } from '../../middleware-service.ts';
${names
  .map(
    (
      s,
    ) => `export class ${s} extends Context.Service<${s}, { get: (n: number) => Effect.Effect<string> }>()('${s}') {}
export const ${s}Live = Layer.succeed(${s}, { get: (n) => Effect.succeed(String(n)) });`,
  )
  .join('\n')}
export class CurrentUser extends Context.Service<CurrentUser, { id: string }>()('CurrentUser') {}
export class Auth extends Context.Service<Auth, MiddlewareImpl<CurrentUser, never, { token?: string }>>()('Auth') {}
export const AuthLive = Layer.succeed(Auth, (next, { ctx }) =>
  next.pipe(Effect.provideService(CurrentUser, { id: ctx.token ?? 'anon' })),
);
export const layer = Layer.mergeAll(${names.map((s) => `${s}Live`).join(', ')});
`,
  );

  if (variant === 'contract') {
    write(
      'contract.ts',
      `import { Schema } from 'effect';
import { experimental_contract } from '@trpc12/trpc/contract';
const c = experimental_contract.create();
export const contract = {
${Array.from(
  { length: files },
  (_, f) => `  r${f}: {
${indices(f)
  .map(
    (i) =>
      `    p${i % PER_FILE}: c.output(${schema(i)}).errors(${errors}).query(),`,
  )
  .join('\n')}
  },`,
).join('\n')}
};
void [Schema, c];
`,
    );
  }

  write(
    'base.ts',
    `import { Effect } from 'effect';
import { initTrpc } from '@trpc12/trpc/server';
import { provideLayer } from '../../layer.ts';
import { useService } from '../../middleware-service.ts';
import { Auth, CurrentUser, layer } from './services.ts';
${variant === 'contract' ? "import { contract } from './contract.ts';\n" : ''}export const t = initTrpc<{ ctx: { token?: string } }>();
export const auth = t.middleware.effect<{ provides: CurrentUser }>()(({ ctx, next }) =>
  next().pipe(Effect.provideService(CurrentUser, { id: ctx.token ?? 'anon' })),
);
${
  variant === 'provide-layer'
    ? 'export const base = provideLayer(t.procedure, layer);\n'
    : ''
}${
      variant === 'middleware-service'
        ? 'export const authed = useService(t.procedure, Auth);\n'
        : ''
    }${variant === 'contract' ? 'export const impl = t.implement(contract);\n' : ''}void [provideLayer, useService, Auth, layer];
`,
  );

  for (let f = 0; f < files; f++) {
    write(
      `router${f}.ts`,
      `import { Effect, Schema } from 'effect';
import { strict } from '../../strict.ts';
import * as b from './base.ts';
import { CurrentUser, ${names.join(', ')} } from './services.ts';
const { t, auth } = b;
${variant === 'provide-layer' ? 'const { base } = b;\n' : ''}${
        variant === 'middleware-service' ? 'const { authed } = b;\n' : ''
      }${variant === 'contract' ? 'const { impl } = b;\n' : ''}void [Effect, Schema, strict, t, auth, CurrentUser, ${names.join(', ')}];
export const router${f} = t.router({
${indices(f)
  .map((i) => `  p${i % PER_FILE}: ${procedure(variant, i)},`)
  .join('\n')}
});
`,
    );
  }

  const routes = Array.from(
    { length: files },
    (_, f) => `  r${f}: router${f},`,
  );
  const layerOption =
    variant === 'provide-layer'
      ? ''
      : variant === 'middleware-service'
        ? ', layer: Layer.merge(layer, AuthLive)'
        : ', layer';
  write(
    'handler.ts',
    `import { Layer } from 'effect';
import { createFetchHandler } from '@trpc12/trpc/server';
import { AuthLive, layer } from './services.ts';
${variant === 'contract' ? "import { impl } from './base.ts';\n" : "import { t } from './base.ts';\n"}${Array.from({ length: files }, (_, f) => `import { router${f} } from './router${f}.ts';`).join('\n')}
void [Layer, AuthLive, layer];
export const appRouter = ${variant === 'contract' ? 'impl' : 't'}.router({
${routes.join('\n')}
});
export const handler = createFetchHandler({
  router: appRouter,
  createContext: () => ({})${layerOption},
});
`,
  );

  write(
    'tsconfig.json',
    JSON.stringify(
      {
        extends: '../../../tsconfig.json',
        compilerOptions: { noEmit: true },
        include: ['*.ts'],
        exclude: [],
      },
      null,
      2,
    ),
  );
  return out;
}

/** Writes `<outRoot>/<variant>-<n>/` and returns its path. */
export const generate = (variant: Variant, n: number, outRoot: string) =>
  writeFixture(join(outRoot, `${variant}-${n}`), fixture(variant, n));
