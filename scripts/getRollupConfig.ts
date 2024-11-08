import path from 'path';
import nodeResolve from '@rollup/plugin-node-resolve';
import type { RollupOptions } from 'rollup';
import del from 'rollup-plugin-delete';
import externals from 'rollup-plugin-node-externals';
import { swc } from 'rollup-plugin-swc3';
import typescript from 'rollup-plugin-typescript2';
import analyzeSizeChange from './analyzeSizeChange';

const isWatchMode = process.argv.includes('--watch');
const extensions = ['.ts', '.tsx'];

type Options = {
  input: string[];
  packageDir: string;
};

export function buildConfig(opts: Options): RollupOptions[] {
  const resolvedInput = opts.input.map((file) =>
    path.resolve(opts.packageDir, file),
  );
  const options: Options = {
    ...opts,
    input: resolvedInput,
  };

  return [types(options), lib(options)];
}

function types({ input, packageDir }: Options): RollupOptions {
  return {
    input,
    output: {
      dir: `${packageDir}/dist`,
      preserveModules: true,
      preserveModulesRoot: 'src',
    },
    plugins: [
      !isWatchMode &&
        del({
          targets: `${packageDir}/dist`,
        }),
      externals({
        packagePath: path.resolve(packageDir, 'package.json'),
        deps: true,
        devDeps: true,
        peerDeps: true,
      }),
      typescript({
        tsconfig: path.resolve(packageDir, 'tsconfig.build.json'),
        tsconfigOverride: { emitDeclarationOnly: true },
        abortOnError: !isWatchMode,
      }),
    ],
  };
}

function lib(opts: Options): RollupOptions {
  const { packageDir } = opts;
  return {
    input: opts.input,
    output: [
      {
        dir: `${packageDir}/dist`,
        format: 'cjs',
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
      {
        dir: `${packageDir}/dist`,
        format: 'esm',
        entryFileNames: '[name].mjs',
        chunkFileNames: '[name]-[hash].mjs',
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    ],
    plugins: [
      externals({
        packagePath: path.resolve(packageDir, 'package.json'),
      }),
      nodeResolve({
        extensions,
      }),
      swc({
        // Use the same tsconfig as typescript plugin
        tsconfig: path.resolve(packageDir, 'tsconfig.build.json'),
      }),
      !isWatchMode && analyzeSizeChange(packageDir),
    ],
  };
}
