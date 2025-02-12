import { fileURLToPath } from 'url';
import path$1 from 'path';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import del from 'rollup-plugin-delete';
import externals from 'rollup-plugin-node-externals';
import { swc } from 'rollup-plugin-swc3';
import { writeFile, readFileSync } from 'node:fs';
import path from 'node:path';
import analyze from 'rollup-plugin-analyzer';

const ABSOLUTE_BYTE_CHANGE_THRESHOLD = 100;
const PERCENT_CHANGE_THRESHOLD = 1;
function analyzeSizeChange(packageDir) {
    let analyzePluginIterations = 0;
    return analyze({
        summaryOnly: process.env.CI ? undefined : true,
        skipFormatted: process.env.CI ? true : undefined,
        onAnalysis: (analysis)=>{
            if (analyzePluginIterations > 0) {
                throw ''; // We only want reports on the first output
            }
            analyzePluginIterations++;
            if (process.env.CI) {
                const { currentPath, prevPath } = resolveJsonPaths(packageDir);
                writeFile(currentPath, JSON.stringify(analysis, undefined, 2), ()=>{});
                // Find previous analysis file on CI
                try {
                    const prevStr = readFileSync(prevPath, 'utf8');
                    const prevAnalysis = JSON.parse(prevStr);
                    console.log('--- Size Change Report ---');
                    console.log('(will be empty if no significant changes are found)');
                    logDifference('Total Bundle', prevAnalysis.bundleSize, analysis.bundleSize);
                    for (const module of analysis.modules){
                        const prevModule = prevAnalysis.modules.find((m)=>m.id === module.id);
                        if (prevModule) {
                            logDifference(`Module '${module.id}'`, prevModule.size, module.size);
                        } else {
                            logNewModule(module.id, module.size);
                        }
                    }
                    console.log('--- End Size Change Report ---');
                } catch  {
                    console.log('No previous bundle analysis found');
                }
            }
        }
    });
}
function logNewModule(name, size) {
    if (size < ABSOLUTE_BYTE_CHANGE_THRESHOLD) {
        return;
    }
    const type = 'notice';
    const options = {
        title: `New Module (${size} bytes in ${name})`
    };
    const message = `${name} size: ${size} bytes`;
    logGithubMessage(type, message, options);
}
function logDifference(name, before, after) {
    const change = difference(before, after);
    if (change.absolute < ABSOLUTE_BYTE_CHANGE_THRESHOLD && change.percent < PERCENT_CHANGE_THRESHOLD) {
        return;
    }
    const type = 'error';
    const options = {
        title: `Important Size Change (${change.absolute} bytes in ${name})`
    };
    const message = `${name} size change: ${change.absolute} bytes (${change.percent.toFixed(2)}%)`;
    logGithubMessage(type, message, options);
}
function logGithubMessage(type, message, options = {}) {
    console.log(stripAnsiEscapes(`::${type} ${formatGithubOptions(options)}::${formatGithubMessage(message)}`));
}
function difference(before, after) {
    const percent = before ? after / before * 100 - 100 : after ? Infinity : 0;
    const absolute = after - before;
    return {
        percent,
        absolute
    };
}
function resolveJsonPaths(packageDir) {
    // TODO: should find a better way to match current w/ downloaded artifacts
    const runnerRoot = '../..';
    const analysisFilePath = 'dist/bundle-analysis.json';
    const previousAnalysisDir = 'downloads/previous-bundle-analysis';
    const currentPath = path.resolve(packageDir, analysisFilePath);
    const relativePath = path.relative(path.resolve(runnerRoot, 'packages'), packageDir);
    const prevPath = path.resolve(runnerRoot, previousAnalysisDir, relativePath, analysisFilePath);
    return {
        currentPath,
        prevPath
    };
}
const ansiRegex = new RegExp('([\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~])))', 'g');
function stripAnsiEscapes(str) {
    return str.replace(ansiRegex, '');
}
function formatGithubOptions(options) {
    return Object.entries(options).map(([key, option])=>`${key}=${option}`).join(',');
}
function formatGithubMessage(message) {
    return message.replace(/\n/g, '%0A');
}

const isWatchMode = process.argv.includes('--watch');
const extensions = [
    '.ts',
    '.tsx'
];
function buildConfig({ input, packageDir }) {
    const resolvedInput = input.map((file)=>path$1.resolve(packageDir, file));
    const options = {
        input: resolvedInput,
        packageDir
    };
    return [
        types(options),
        lib(options)
    ];
}
function types({ input, packageDir, externalPackages }) {
    return {
        input,
        output: {
            dir: `${packageDir}/dist`,
            preserveModules: true,
            preserveModulesRoot: 'src'
        },
        external: externalPackages,
        plugins: [
            !isWatchMode && del({
                targets: `${packageDir}/dist`
            }),
            externals({
                packagePath: path$1.resolve(packageDir, 'package.json'),
                deps: true,
                devDeps: true,
                peerDeps: true
            }),
            typescript({
                tsconfig: path$1.resolve(packageDir, 'tsconfig.build.json'),
                outDir: path$1.resolve(packageDir, 'dist')
            })
        ]
    };
}
function lib({ input, packageDir, externalPackages }) {
    return {
        input,
        output: [
            {
                dir: `${packageDir}/dist`,
                format: 'cjs',
                entryFileNames: '[name].js',
                chunkFileNames: '[name]-[hash].js',
                preserveModules: true,
                preserveModulesRoot: 'src'
            },
            {
                dir: `${packageDir}/dist`,
                format: 'esm',
                entryFileNames: '[name].mjs',
                chunkFileNames: '[name]-[hash].mjs',
                preserveModules: true,
                preserveModulesRoot: 'src'
            }
        ],
        external: externalPackages,
        plugins: [
            externals({
                packagePath: path$1.resolve(packageDir, 'package.json')
            }),
            nodeResolve({
                extensions
            }),
            swc({
                tsconfig: false,
                jsc: {
                    target: 'es2020',
                    transform: {
                        react: {
                            useBuiltins: true
                        }
                    },
                    externalHelpers: false
                }
            }),
            !isWatchMode && analyzeSizeChange(packageDir)
        ]
    };
}

const input = [
    'src/index.ts',
    'src/rsc.tsx',
    'src/server/index.ts',
    'src/shared/index.ts'
];
function rollup() {
    return buildConfig({
        input,
        packageDir: fileURLToPath(new URL('.', 'file:///Users/alex/dev/trpc/packages/react-query/rollup.config.ts'))
    });
}

export { rollup as default, input };
