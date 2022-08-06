import { babel } from '@rollup/plugin-babel';
import nodeResolve from '@rollup/plugin-node-resolve';
import path from 'path';
import { RollupOptions } from 'rollup';
import del from 'rollup-plugin-delete';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - no typedefs exist for this plugin
import multiInput from 'rollup-plugin-multi-input';
import externals from 'rollup-plugin-node-externals';
import { terser } from 'rollup-plugin-terser';
import typescript from 'rollup-plugin-typescript2';

const isWatchMode = process.argv.includes('--watch');
const isProd = process.env.NODE_ENV === 'production';
const extensions = ['.ts', '.tsx'];

const babelPlugin = babel({
  babelHelpers: 'runtime',
  extensions,
});
const getMultiInputPlugin = (packageDir: string) =>
  multiInput({ relative: path.resolve(packageDir, 'src/') });

const serverInput = [
  'src/index.ts',
  'src/adapters/aws-lambda/index.ts',
  'src/adapters/express.ts',
  'src/adapters/fastify/index.ts',
  'src/adapters/next.ts',
  'src/adapters/node-http/index.ts',
  'src/adapters/standalone.ts',
  'src/adapters/ws.ts',
  'src/adapters/fetch/index.ts',
  'src/rpc/index.ts',
  'src/observable/index.ts',
  'src/subscription.ts',
  // Utils that can be shared with clients
  'src/shared/index.ts',
];
const clientInput = [
  'src/index.ts',
  'src/links/httpLink.ts',
  'src/links/httpBatchLink.ts',
  'src/links/splitLink.ts',
  'src/links/loggerLink.ts',
  'src/links/wsLink.ts',
];
const reactInput = ['src/index.ts', 'src/ssg.ts'];
const nextInput = ['src/index.ts'];

export default function rollup(): RollupOptions[] {
  return [
    ...buildConfig({
      input: serverInput,
      packageDir: 'packages/server',
    }),
    ...buildConfig({
      input: clientInput,
      packageDir: 'packages/client',
    }),
    ...buildConfig({
      input: reactInput,
      packageDir: 'packages/react',
    }),
    ...buildConfig({
      input: nextInput,
      packageDir: 'packages/next',
    }),
  ];
}

type Options = {
  input: string[];
  packageDir: string;
};

function buildConfig({ input, packageDir }: Options): RollupOptions[] {
  const resolvedInput = input.map((file) => path.resolve(packageDir, file));
  const options: Options = {
    input: resolvedInput,
    packageDir,
  };

  return [types(options), esm(options), cjs(options)];
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
          targets: ['dist'],
        }),
      getMultiInputPlugin(packageDir),
      typescript({
        tsconfig: path.resolve(packageDir, 'tsconfig.build.json'),
        abortOnError: !isWatchMode,
      }),
    ],
  };
}

function cjs({ input, packageDir }: Options): RollupOptions {
  return {
    input,
    output: {
      dir: `${packageDir}/dist`,
      format: 'cjs',
      entryFileNames: '[name].js',
      plugins: [isProd && terser({ module: false })],
    },
    plugins: [
      getMultiInputPlugin(packageDir),
      externals({
        packagePath: path.resolve(packageDir, 'package.json'),
      }),
      nodeResolve({
        extensions,
      }),
      babelPlugin,
    ],
  };
}

function esm({ input, packageDir }: Options): RollupOptions {
  return {
    input,
    output: {
      dir: `${packageDir}/dist`,
      format: 'esm',
      entryFileNames: '[name].mjs',
      chunkFileNames: '[name]-[hash].mjs',
      plugins: [isProd && terser({ module: true })],
    },
    plugins: [
      getMultiInputPlugin(packageDir),
      externals({
        packagePath: path.resolve(packageDir, 'package.json'),
      }),
      nodeResolve({
        extensions,
      }),
      babelPlugin,
    ],
  };
}
