/**
 * Writes `generated/<variant>-<n>/`: `n` procedures (10 per file, half queries
 * with input, half mutations with an error map on the contract side), a
 * router, and a client that calls every procedure.
 *
 * - `impl-first`: plain procedures; the client takes `typeof appRouter`
 *   (reduced through `inferContract`).
 * - `contract`: a contract tree, `t.implement()` per file and a top-level
 *   `impl.router()` completeness check; the client takes `typeof appContract`.
 */
import { join } from 'node:path';
import { writeFixture, type Files } from '../kit.ts';

export const variants = ['impl-first', 'contract'] as const;
export type Variant = (typeof variants)[number];

const PER_FILE = 10;

function contractProc(i: number): string {
  return i % 2 === 0
    ? `c.input(schema<{ id: string; f${i}: number }>()).output(schema<{ id: string; v${i}: number }>()).query()`
    : `c.input(schema<{ title: string }>()).output(schema<{ ok${i}: boolean }>()).errors({ C${i}: { status: 409 } }).mutation()`;
}
function implProc(i: number, variant: Variant, file: number): string {
  const p = `p${i % PER_FILE}`;
  const base = variant === 'contract' ? `impl.r${file}.${p}` : 't.procedure';
  return i % 2 === 0
    ? variant === 'contract'
      ? `${base}.query(({ input }) => ({ id: input.id, v${i}: input.f${i} }))`
      : `${base}.input(schema<{ id: string; f${i}: number }>()).query(({ input }) => ({ id: input.id, v${i}: input.f${i} }))`
    : variant === 'contract'
      ? `${base}.mutation(async () => ({ ok${i}: true }))`
      : `${base}.input(schema<{ title: string }>()).mutation(async () => ({ ok${i}: true }))`;
}

/** The fixture's files, by path in its directory. */
export function fixture(variant: Variant, n: number): Files {
  const out: Array<readonly [string, string]> = [];
  const write = (file: string, contents: string) => {
    out.push([file, contents]);
  };
  const dir = '';
  const files = Math.ceil(n / PER_FILE);
  const each = (fn: (f: number) => string, sep = '\n') =>
    Array.from({ length: files }, (_, f) => fn(f)).join(sep);
  const procsIn = (f: number) =>
    Array.from(
      { length: Math.min(PER_FILE, n - f * PER_FILE) },
      (_, p) => f * PER_FILE + p,
    );

  write(
    join(dir, 'base.ts'),
    `import { initTrpc } from '../../core.ts';
export const t = initTrpc<{ user?: { id: string } }>();
`,
  );

  if (variant === 'contract') {
    for (let f = 0; f < files; f++) {
      write(
        join(dir, `contract${f}.ts`),
        `import { contract, schema } from '../../core.ts';
const c = contract.create();
export const contract${f} = {
${procsIn(f)
  .map((i) => `  p${i % PER_FILE}: ${contractProc(i)},`)
  .join('\n')}
};
`,
      );
    }
    write(
      join(dir, 'contract.ts'),
      `${each((f) => `import { contract${f} } from './contract${f}.ts';`)}
export const appContract = {
${each((f) => `  r${f}: contract${f},`)}
};
`,
    );
  }

  for (let f = 0; f < files; f++) {
    write(
      join(dir, `router${f}.ts`),
      variant === 'contract'
        ? `import { t } from './base.ts';
import { appContract } from './contract.ts';
const impl = t.implement(appContract);
export const router${f} = {
${procsIn(f)
  .map((i) => `  p${i % PER_FILE}: ${implProc(i, variant, f)},`)
  .join('\n')}
};
`
        : `import { schema } from '../../core.ts';
import { t } from './base.ts';
export const router${f} = {
${procsIn(f)
  .map((i) => `  p${i % PER_FILE}: ${implProc(i, variant, f)},`)
  .join('\n')}
};
`,
    );
  }

  write(
    join(dir, 'router.ts'),
    `${each((f) => `import { router${f} } from './router${f}.ts';`)}
${
  variant === 'contract'
    ? `import { t } from './base.ts';
import { appContract } from './contract.ts';
export const appRouter = t.implement(appContract).router({
${each((f) => `  r${f}: router${f},`)}
});`
    : `export const appRouter = {
${each((f) => `  r${f}: router${f},`)}
};`
}
`,
  );

  write(
    join(dir, 'client.ts'),
    `import { createClient } from '../../core.ts';
${variant === 'contract' ? `import type { appContract } from './contract.ts';\nconst client = createClient<typeof appContract>();` : `import type { appRouter } from './router.ts';\nconst client = createClient<typeof appRouter>();`}
${Array.from({ length: n }, (_, i) => {
  const path = `client.r${Math.floor(i / PER_FILE)}.p${i % PER_FILE}`;
  return i % 2 === 0
    ? `export const c${i} = () => ${path}.query({ id: 'a', f${i}: 1 }).then((r) => r.v${i});`
    : `export const c${i} = () => ${path}.mutate({ title: 'a' }).then((r) => r.ok${i});`;
}).join('\n')}
`,
  );

  write(
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
  return out;
}

/** Writes `<outRoot>/<variant>-<n>/` and returns its path. */
export const generate = (variant: Variant, n: number, outRoot: string) =>
  writeFixture(join(outRoot, `${variant}-${n}`), fixture(variant, n));
