/**
 * Writes `generated/<variant>-<n>/`: `n` procedures (10 per file) that return
 * errors from middleware and resolvers, a router, and a client that calls
 * `safe()` on every procedure and reads `error.code`.
 *
 * - `thrown`: same shapes, but every error is thrown, so nothing is inferred.
 *   Measures what the machinery costs when unused.
 * - `whole`: middleware via `use` (infer the whole return, then split).
 * - `split`: middleware via `useSplit` (separate ctx and error parameters).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const variants = ['thrown', 'whole', 'split'] as const;
export type Variant = (typeof variants)[number];

const PER_FILE = 10;

function procedure(i: number, variant: Variant): string {
  const ret = variant === 'thrown' ? 'throw' : 'return';
  const use = variant === 'split' ? 'useSplit' : 'use';
  const base =
    variant === 'thrown'
      ? 'authedThrown'
      : variant === 'split'
        ? 'authedSplit'
        : 'authed';
  switch (i % 5) {
    case 0:
      return `t.procedure.query(() => {
    if (Math.random() > 0.5) ${ret} error({ code: 'NOT_FOUND', data: { n${i}: 1 } });
    return { id: 'x', n${i}: 1 };
  })`;
    case 1:
      return `t.procedure
    .input(schema<{ id: string; f${i}: number }>())
    .query(({ input }) => {
      if (input.f${i} < 0) ${ret} error({ code: 'C${i}', status: 400, data: { f${i}: input.f${i} } });
      return { id: input.id, at: new Date() };
    })`;
    case 2:
      return `${base}
    .input(schema<{ title: string; m${i}: string }>())
    .query(async ({ ctx, input }) => ({ ...input, by: ctx.user.id }))`;
    case 3:
      return variant === 'thrown'
        ? `${base}.query(() => {
    if (Math.random() > 0.5) throw error({ code: 'PAYMENT_REQUIRED', data: { plan${i}: 'pro' } });
    return { ok${i}: true };
  })`
        : `${base}
    .errors({ PAYMENT_REQUIRED: { status: 402, data: schema<{ plan${i}: string }>() } })
    .query(({ errors }) => {
      if (Math.random() > 0.5) throw errors.PAYMENT_REQUIRED({ data: { plan${i}: 'pro' } });
      return { ok${i}: true };
    })`;
    default:
      return `t.procedure
    .${use}(async ({ next }) => {
      if (Math.random() > 0.5) ${ret} error({ code: 'FORBIDDEN', data: { r${i}: 1 } });
      return next({ ctx: { reqId: 'r${i}' } });
    })
    .${use}(async ({ ctx, next }) => {
      if (Math.random() > 0.5) ${ret} error({ code: 'CONFLICT' });
      return next({ ctx: { both${i}: ctx.reqId + '!' } });
    })
    .query(({ ctx }) => ({ v${i}: ctx.both${i} }))`;
  }
}

function clientCall(i: number): string {
  const path = `client.r${Math.floor(i / PER_FILE)}.p${i % PER_FILE}`;
  const call =
    i % 5 === 1
      ? `${path}.query({ id: 'a', f${i}: 1 })`
      : i % 5 === 2
        ? `${path}.query({ title: 'a', m${i}: 'b' })`
        : `${path}.query()`;
  // One function per call: narrowing at the top level of a 1k-statement file
  // makes control-flow analysis quadratic and swamps the builder's cost.
  return `export async function c${i}() {
  const [, e] = await safe(${call});
  return e?.defined ? e.code : undefined;
}`;
}

export function generate(variant: Variant, n: number, outRoot: string): string {
  const dir = join(outRoot, `${variant}-${n}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    join(dir, 'base.ts'),
    `import { error, initTrpc } from '../../core.ts';
interface Context { user?: { id: string; name: string } }
export const t = initTrpc<Context>();
export const authed = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) return error({ code: 'UNAUTHORIZED' });
  return next({ ctx: { user: ctx.user } });
});
export const authedSplit = t.procedure.useSplit(async ({ ctx, next }) => {
  if (!ctx.user) return error({ code: 'UNAUTHORIZED' });
  return next({ ctx: { user: ctx.user } });
});
export const authedThrown = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw error({ code: 'UNAUTHORIZED' });
  return next({ ctx: { user: ctx.user } });
});
`,
  );

  const files = Math.ceil(n / PER_FILE);
  for (let f = 0; f < files; f++) {
    const procs: string[] = [];
    for (let p = 0; p < PER_FILE && f * PER_FILE + p < n; p++) {
      procs.push(`  p${p}: ${procedure(f * PER_FILE + p, variant)},`);
    }
    writeFileSync(
      join(dir, `router${f}.ts`),
      `import { error, schema } from '../../core.ts';
import { authed, authedSplit, authedThrown, t } from './base.ts';
void error; void schema; void authed; void authedSplit; void authedThrown; void t;
export const router${f} = {
${procs.join('\n')}
};
`,
    );
  }

  writeFileSync(
    join(dir, 'router.ts'),
    `${Array.from({ length: files }, (_, f) => `import { router${f} } from './router${f}.ts';`).join('\n')}
export const appRouter = {
${Array.from({ length: files }, (_, f) => `  r${f}: router${f},`).join('\n')}
};
export type AppRouter = typeof appRouter;
`,
  );

  writeFileSync(
    join(dir, 'client.ts'),
    `import { createClient, safe } from '../../core.ts';
import type { AppRouter } from './router.ts';
const client = createClient<AppRouter>();
${Array.from({ length: n }, (_, i) => clientCall(i)).join('\n')}
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
