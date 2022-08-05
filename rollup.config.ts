import { babel } from '@rollup/plugin-babel';
import nodeResolve from '@rollup/plugin-node-resolve';
import path from 'path';
import type { RollupOptions } from 'rollup';
import dts from 'rollup-plugin-dts';
import externals from 'rollup-plugin-node-externals';

const extensions = ['.ts', '.tsx'];

type Options = {
  input: string[];
  packageDir: string;
  external: RollupOptions['external'];
  jsName: string;
  globals: Record<string, string>;
};

const clientInput = [
  'src/index.ts',
  'src/links/httpLink.ts',
  'src/links/httpBatchLink.ts',
  'src/links/splitLink.ts',
  'src/links/loggerLink.ts',
  'src/links/wsLink.ts',
];
const nextInput = ['src/index.ts'];
const reactInput = ['src/index.ts', 'src/ssg.ts'];
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

const babelPlugin = babel({
  babelHelpers: 'runtime',
  exclude: /node_modules/,
  configFile: path.join(__dirname, 'babel.config.js'),
  extensions,
});

export default function rollup(): RollupOptions[] {
  return [
    ...buildConfig({
      input: serverInput,
      packageDir: 'packages/server',
      jsName: '@trpc/server',
      globals: {},
    }),
    ...buildConfig({
      input: clientInput,
      packageDir: 'packages/client',
      jsName: '@trpc/client',
      globals: {},
    }),
    ...buildConfig({
      input: nextInput,
      packageDir: 'packages/next',
      jsName: '@trpc/next',
      globals: {},
    }),
    ...buildConfig({
      input: reactInput,
      packageDir: 'packages/react',
      jsName: '@trpc/react',
      globals: {},
    }),
  ];
}

function buildConfig({
  packageDir,
  jsName,
  input,
  globals,
}: Pick<
  Options,
  'input' | 'packageDir' | 'jsName' | 'globals'
>): RollupOptions[] {
  const resolvedInput = input.map((file) => path.resolve(packageDir, file));

  const options: Options = {
    input: resolvedInput,
    packageDir,
    external: [],
    jsName,
    globals,
  };

  return [esm(options), types(options), cjs(options)];
}

function esm({ external, input, packageDir }: Options): RollupOptions {
  return {
    external,
    input,
    output: {
      format: 'esm',
      preserveModules: true,
      exports: 'named',
      dir: `${packageDir}/dist`,
      entryFileNames: '[name].mjs',
    },
    plugins: [
      babelPlugin,
      nodeResolve({ extensions }),
      externals({ deps: true }),
    ],
  };
}

function cjs({ external, input, packageDir }: Options): RollupOptions {
  return {
    external,
    input,
    output: {
      format: 'cjs',
      preserveModules: true,
      exports: 'named',
      dir: `${packageDir}/dist`,
      entryFileNames: '[name].js',
    },
    plugins: [
      babelPlugin,
      nodeResolve({ extensions }),
      externals({ deps: true }),
    ],
  };
}

function types({ external, input, packageDir }: Options): RollupOptions {
  return {
    external,
    input,
    output: {
      format: 'esm',
      preserveModules: true,
      exports: 'named',
      dir: `${packageDir}/dist`,
    },
    plugins: [
      babelPlugin,
      nodeResolve({ extensions }),
      externals({ deps: true }),
      dts(),
    ],
  };
}
