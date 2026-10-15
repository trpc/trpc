/**
 * Writes `generated/<variant>-<n>/`: 20 services, `n` Effect procedures (10 per
 * file) that each use one or two of them (a third behind a service-providing
 * middleware), a router, and a handler whose `layer` is checked.
 *
 * - `inferred` (02 S1): the handler computes the union of every procedure's
 *   services across the router.
 * - `declared` (02 S2): services are declared in `initTrpc.create()`; each
 *   resolver is checked against them and the handler only reads the declared set.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const variants = ['inferred', 'declared'] as const;
export type Variant = (typeof variants)[number];

const PER_FILE = 10;
const SERVICES = 20;
const svc = (i: number) => `S${i % SERVICES}`;

function procedure(i: number): string {
  switch (i % 3) {
    case 0:
      return `t.procedure.query(() => ${svc(i)}.use((s) => s.get(${i})))`;
    case 1:
      return `t.procedure.query(() =>
    Effect.gen(function* () {
      const a = yield* ${svc(i)};
      const b = yield* ${svc(i + 7)};
      return { a${i}: yield* a.get(${i}), b: yield* b.get(${i}) };
    }),
  )`;
    default:
      return `t.procedure.use(auth).query(() =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      const s = yield* ${svc(i)};
      return { u${i}: user.id, v: yield* s.get(${i}) };
    }),
  )`;
  }
}

export function generate(variant: Variant, n: number, outRoot: string): string {
  const dir = join(outRoot, `${variant}-${n}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const names = Array.from({ length: SERVICES }, (_, i) => `S${i}`);
  writeFileSync(
    join(dir, 'services.ts'),
    `import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
${names
  .map(
    (
      s,
    ) => `export class ${s} extends Context.Service<${s}, { get: (n: number) => Effect.Effect<string> }>()('${s}') {}
export const ${s}Live = Layer.succeed(${s}, { get: (n) => Effect.succeed(String(n)) });`,
  )
  .join('\n')}
export class CurrentUser extends Context.Service<CurrentUser, { id: string }>()('CurrentUser') {}
export const layer = Layer.mergeAll(${names.map((s) => `${s}Live`).join(', ')});
`,
  );

  writeFileSync(
    join(dir, 'base.ts'),
    `import * as Effect from 'effect/Effect';
import { initTrpc } from '../../core.ts';
import { CurrentUser, ${names.join(', ')} } from './services.ts';
export const t = initTrpc.create<{ ctx: { token?: string }${
      variant === 'declared' ? `; services: ${names.join(' | ')}` : ''
    } }>();
export const auth = t.middleware.effect<{ provides: CurrentUser }>()(({ ctx, next }) =>
  next().pipe(Effect.provideService(CurrentUser, { id: ctx.token ?? 'anon' })),
);
void [${names.join(', ')}];
`,
  );

  const files = Math.ceil(n / PER_FILE);
  for (let f = 0; f < files; f++) {
    const procs: string[] = [];
    for (let p = 0; p < PER_FILE && f * PER_FILE + p < n; p++) {
      procs.push(`  p${p}: ${procedure(f * PER_FILE + p)},`);
    }
    writeFileSync(
      join(dir, `router${f}.ts`),
      `import * as Effect from 'effect/Effect';
import { auth, t } from './base.ts';
import { CurrentUser, ${names.join(', ')} } from './services.ts';
void Effect; void auth; void CurrentUser; void [${names.join(', ')}];
export const router${f} = {
${procs.join('\n')}
};
`,
    );
  }

  writeFileSync(
    join(dir, 'handler.ts'),
    `import { createHandler } from '../../core.ts';
import { t } from './base.ts';
import { layer } from './services.ts';
${Array.from({ length: files }, (_, f) => `import { router${f} } from './router${f}.ts';`).join('\n')}
export const appRouter = {
${Array.from({ length: files }, (_, f) => `  r${f}: router${f},`).join('\n')}
};
export const handler = createHandler({ root: t, router: appRouter, layer });
`,
  );

  writeFileSync(
    join(dir, 'tsconfig.json'),
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
  return dir;
}
