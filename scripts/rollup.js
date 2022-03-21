import { babel } from '@rollup/plugin-babel';
import nodeResolve from '@rollup/plugin-node-resolve';
import path from 'path';
import { defineConfig } from 'rollup';
import del from 'rollup-plugin-delete';
import multiInput from 'rollup-plugin-multi-input';
import externals from 'rollup-plugin-node-externals';
import { terser } from 'rollup-plugin-terser';
import typescript from 'rollup-plugin-typescript2';

const isWatchMode = process.argv.includes('--watch');

const extensions = ['.ts', '.tsx'];

// needed so directory structure is preserved
// otherwise rollup will flatten it
const getMultiInputPlugin = () => multiInput({ relative: 'src/' });

export const getRollupConfig = ({ input }) => {
  return defineConfig([
    {
      input,
      output: {
        dir: 'dist',
        // hack so these files stop overwriting the actual bundled files
        entryFileNames: '[name].ts.js',
        chunkFileNames: '[name].ts.js',
      },
      plugins: [
        !isWatchMode &&
          del({
            targets: ['dist'],
          }),
        getMultiInputPlugin(),
        typescript({
          tsconfig: 'tsconfig.build.json',
          abortOnError: !isWatchMode,
        }),
      ],
    },
    {
      input,
      output: [
        {
          dir: 'dist',
          format: 'cjs',
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
          plugins: [
            process.env.NODE_ENV === 'production' &&
              terser({
                module: false,
              }),
          ],
        },
        {
          dir: 'dist',
          format: 'esm',
          entryFileNames: '[name].mjs',
          chunkFileNames: '[name]-[hash].mjs',
          plugins: [
            process.env.NODE_ENV === 'production' &&
              terser({
                module: true,
              }),
          ],
        },
      ],
      plugins: [
        getMultiInputPlugin(),
        externals({
          deps: true,
        }),
        nodeResolve({
          extensions,
        }),
        babel({
          babelHelpers: 'runtime',
          configFile: path.join(__dirname, '..', '..', 'babel.config.js'),
          extensions,
        }),
      ],
    },
  ]);
};
