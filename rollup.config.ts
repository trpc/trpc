import nodeResolve from '@rollup/plugin-node-resolve';
import path from 'path';
import { RollupOptions } from 'rollup';
import del from 'rollup-plugin-delete';
// @ts-expect-error no typedefs exist for this plugin
import multiInput from 'rollup-plugin-multi-input';
import externals from 'rollup-plugin-node-externals';
import { swc } from 'rollup-plugin-swc3';
import typescript from 'rollup-plugin-typescript2';

const isWatchMode = process.argv.includes('--watch');
const extensions = ['.ts', '.tsx'];

// Exporting this for generating barrel-files in scripts/entrypoints.ts
export const PACKAGES = ['server', 'client', 'react', 'next'] as const;
export const INPUTS: Record<typeof PACKAGES[number], string[]> = {
  server: [
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
  ],
  client: [
    'src/index.ts',
    'src/links/httpLink.ts',
    'src/links/httpBatchLink.ts',
    'src/links/splitLink.ts',
    'src/links/loggerLink.ts',
    'src/links/wsLink.ts',
  ],
  react: ['src/index.ts', 'src/ssg/index.ts', 'src/shared/index.ts'],
  next: ['src/index.ts'],
};

export default function rollup(): RollupOptions[] {
  return [
    ...buildConfig({
      input: INPUTS.server,
      packageDir: 'packages/server',
    }),
    ...buildConfig({
      input: INPUTS.client,
      packageDir: 'packages/client',
    }),
    ...buildConfig({
      input: INPUTS.react,
      packageDir: 'packages/react',
    }),
    ...buildConfig({
      input: INPUTS.next,
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
    ],
  };
}
