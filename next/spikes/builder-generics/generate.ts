/**
 * Writes `generated/<variant>-<n>/`: `n` procedures spread over files of 10,
 * a root router, and a client file that calls every procedure.
 *
 * Every procedure gets unique input/output types so the checker cannot
 * reuse one instantiation for the whole router.
 */
import { join } from 'node:path';
import { writeFixture, type Files } from '../kit.ts';

export const variants = ['positional', 'bag-intersect', 'bag-mapped'] as const;
export type Variant = (typeof variants)[number];

const PER_FILE = 10;

function procedure(i: number): string {
  switch (i % 5) {
    case 0:
      return `t.procedure.query(() => ({ id: 'x', n${i}: 1 }))`;
    case 1:
      return `t.procedure
    .input(schema<{ id: string; f${i}: number }>())
    .query(({ input }) => ({ id: input.id, f${i}: input.f${i}, at: new Date() }))`;
    case 2:
      return `authed
    .input(schema<{ title: string; m${i}: string }>())
    .mutation(async ({ ctx, input }) => ({ ...input, by: ctx.user.id }))`;
    case 3:
      return `authed
    .input(schema<{ a${i}: number }>())
    .input(schema<{ b${i}: string }>())
    .output(schema<{ ok${i}: boolean }>())
    .query(({ input }) => ({ ok${i}: input.a${i} > 0 && input.b${i} !== '' }))`;
    default:
      return `t.procedure
    .use(({ next }) => next({ ctx: { reqId: 'r${i}' } }))
    .use(({ ctx, next }) => next({ ctx: { both${i}: ctx.reqId + '!' } }))
    .meta({ tag: 't${i}' })
    .query(({ ctx }) => ({ v${i}: ctx.both${i} }))`;
  }
}

function clientCall(i: number): string {
  const path = `client.r${Math.floor(i / PER_FILE)}.p${i % PER_FILE}`;
  switch (i % 5) {
    case 0:
      return `export const o${i}: number = (await ${path}.query()).n${i};`;
    case 1:
      return `export const o${i}: Date = (await ${path}.query({ id: 'a', f${i}: 1 })).at;`;
    case 2:
      return `export const o${i}: string = (await ${path}.mutate({ title: 'a', m${i}: 'b' })).by;`;
    case 3:
      return `export const o${i}: boolean = (await ${path}.query({ a${i}: 1, b${i}: 'x' })).ok${i};`;
    default:
      return `export const o${i}: string = (await ${path}.query()).v${i};`;
  }
}

/** The fixture's files, by path in its directory. */
export function fixture(variant: Variant, n: number): Files {
  const out: Array<readonly [string, string]> = [];
  const write = (file: string, contents: string) => {
    out.push([file, contents]);
  };
  const dir = '';
  const builder = `../../${variant}.ts`;

  write(
    join(dir, 'base.ts'),
    `import { init } from '${builder}';
interface Context { user?: { id: string; name: string }; db: { url: string } }
interface Meta { tag?: string }
export const t = init<{ ctx: Context; meta: Meta }>();
export const authed = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new Error('UNAUTHORIZED');
  return next({ ctx: { user: ctx.user } });
});
`,
  );

  const files = Math.ceil(n / PER_FILE);
  for (let f = 0; f < files; f++) {
    const procs: string[] = [];
    for (let p = 0; p < PER_FILE && f * PER_FILE + p < n; p++) {
      procs.push(`  p${p}: ${procedure(f * PER_FILE + p)},`);
    }
    write(
      join(dir, `router${f}.ts`),
      `import { schema } from '../../shared.ts';
import { authed, t } from './base.ts';
void schema; void authed; void t;
export const router${f} = {
${procs.join('\n')}
};
`,
    );
  }

  const imports = Array.from(
    { length: files },
    (_, f) => `import { router${f} } from './router${f}.ts';`,
  );
  write(
    join(dir, 'router.ts'),
    `${imports.join('\n')}
export const appRouter = {
${Array.from({ length: files }, (_, f) => `  r${f}: router${f},`).join('\n')}
};
export type AppRouter = typeof appRouter;
`,
  );

  write(
    join(dir, 'client.ts'),
    `import { createClient } from '${builder}';
import type { AppRouter } from './router.ts';
const client = createClient<AppRouter>();
${Array.from({ length: n }, (_, i) => clientCall(i)).join('\n')}
`,
  );

  write(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: '../../../../tsconfig.json',
        compilerOptions: {
          allowImportingTsExtensions: true,
          rewriteRelativeImportExtensions: true,
          declaration: true,
          rootDir: '../..',
          outDir: 'dist',
          noEmit: false,
          emitDeclarationOnly: true,
        },
        include: ['*.ts'],
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
