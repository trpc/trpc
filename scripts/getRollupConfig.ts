import nodeResolve from '@rollup/plugin-node-resolve';
import path from 'path';
import { RollupOptions } from 'rollup';
import del from 'rollup-plugin-delete';
// @ts-expect-error no typedefs exist for this plugin
import multiInput from 'rollup-plugin-multi-input';
import externals from 'rollup-plugin-node-externals';
import { swc } from 'rollup-plugin-swc3';
import typescript from 'rollup-plugin-typescript2';
import analyze from 'rollup-plugin-analyzer'
import { readFileSync, writeFile } from "fs"

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
  let analyzePluginIterations = 0;
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
      !isWatchMode &&
        analyze({
          summaryOnly: process.env.CI ? undefined : true,
          skipFormatted: process.env.CI ? true : undefined,
          onAnalysis: (analysis) => {
            if (analyzePluginIterations > 0) {
              throw ''; // We only want reports on the first output
            }
            analyzePluginIterations++;
            const analysisFilePath = path.resolve(packageDir, 'dist', 'bundle-analysis.json');
            writeFile(analysisFilePath, JSON.stringify(analysis, undefined, 2), () => {})
            if (process.env.CI) {
              // Find previous analysis file on CI
              const previousAnalysisFilePath = path.resolve('~', 'download', 'previous-bundle-analysis', packageDir, 'dist', 'bundle-analysis.json');
              try {
                const prevStr = readFileSync(previousAnalysisFilePath, 'utf8')
                const prevAnalysis = JSON.parse(prevStr)
                console.log(`Bundle size change: ${analysis.bundleSize - prevAnalysis.bundleSize} bytes`)
                for (const module of analysis.modules) {
                  const prevModule = prevAnalysis.modules.find((m: any) => m.id === module.id)
                  if (prevModule) {
                    console.log(`Module '${module.id}' size change: ${module.size - prevModule.size} bytes (${(module.size / prevModule.size * 100).toFixed(2)}%)`)
                  } else {
                    console.log(`New module '${module.id}': ${module.size} bytes`)
                  }
                }
              } catch (err) {
                console.log('No previous bundle analysis found')
                console.log('previousAnalysisFilePath', previousAnalysisFilePath)
                console.log('analysisFilePath', analysisFilePath)
                console.log('packageDir', packageDir)
                console.log(err)
              }
            }
          }
        }),
    ],
  };
}
