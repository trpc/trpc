import { defineConfig } from 'tsdown';

export default [
  defineConfig({
    target: ['node18', 'es2017'],
    entry: ['src/index.ts', 'src/heyapi/index.ts'],
    dts: {
      sourcemap: true,
      tsconfig: './tsconfig.build.json',
    },
    format: ['cjs', 'esm'],
    outExtensions: (ctx) => ({
      dts: ctx.format === 'cjs' ? '.d.cts' : '.d.mts',
      js: ctx.format === 'cjs' ? '.cjs' : '.mjs',
    }),
  }),
  // CLI binary — compiled as a self-contained ESM script.
  // The shebang in the source file is preserved by tsdown/rolldown.
  defineConfig({
    target: 'node18',
    entry: { cli: 'src/cli.ts' },
    format: 'esm',
    dts: false,
    external: ['typescript'],
  }),
];
