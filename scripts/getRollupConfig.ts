import path from 'path';
import nodeResolve from '@rollup/plugin-node-resolve';
import { RollupOptions } from 'rollup';
import del from 'rollup-plugin-delete';
// @ts-expect-error no typedefs exist for this plugin
import multiInput from 'rollup-plugin-multi-input';
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

export function buildConfig({ input, packageDir }: Options): RollupOptions[] {
  const resolvedInput = input.map((file) => path.resolve(packageDir, file));
  const options: Options = {
    input: resolvedInput,
    packageDir,
  };

  return [types(options), lib(options)];
}

function types({ input, packageDir }: Options): RollupOptions {
  return {
    input,
    output: {
      dir: `${packageDir}/dist`,
    },
    plugins: [
      !isWatchMode &&
        del({
          targets: `${packageDir}/dist`,
        }),
      multiInput({ relative: path.resolve(packageDir, 'src/') }),
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

function lib({ input, packageDir }: Options): RollupOptions {
  return {
    input,
    output: [
      {
        dir: `${packageDir}/dist`,
        format: 'cjs',
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
      },
      {
        dir: `${packageDir}/dist`,
        format: 'esm',
        entryFileNames: '[name].mjs',
        chunkFileNames: '[name]-[hash].mjs',
      },
    ],
    plugins: [
      multiInput({ relative: path.resolve(packageDir, 'src/') }),
      externals({
        packagePath: path.resolve(packageDir, 'package.json'),
      }),
      nodeResolve({
        extensions,
      }),
      swc({
        tsconfig: false,
        jsc: {
          target: 'es2020',
          transform: {
            react: {
              useBuiltins: true,
            },
          },
          externalHelpers: true,
        },
      }),
      !isWatchMode && analyzeSizeChange(packageDir),
    ],
  };
}
