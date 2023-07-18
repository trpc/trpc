import { readdirSync, readFileSync, writeFile } from 'node:fs';
import path from 'node:path';
import analyze from 'rollup-plugin-analyzer';

const ABSOLUTE_BYTE_CHANGE_THRESHOLD = 100;
const PERCENT_CHANGE_THRESHOLD = 1;

export default function analyzeSizeChange(packageDir: string) {
  let analyzePluginIterations = 0;
  return analyze({
    summaryOnly: process.env.CI ? undefined : true,
    skipFormatted: process.env.CI ? true : undefined,
    onAnalysis: (analysis) => {
      if (analyzePluginIterations > 0) {
        throw ''; // We only want reports on the first output
      }
      analyzePluginIterations++;
      if (process.env.CI) {
        const { currentPath, prevPath } = resolveJsonPaths(packageDir);

        writeFile(
          currentPath,
          JSON.stringify(analysis, undefined, 2),
          () => {},
        );

        // Find previous analysis file on CI
        try {
          const prevStr = readFileSync(prevPath, 'utf8');
          const prevAnalysis = JSON.parse(prevStr);
          console.log('--- Size Change Report ---');
          console.log('(will be empty if no significant changes are found)');
          logDifference(
            'Total Bundle',
            prevAnalysis.bundleSize,
            analysis.bundleSize,
          );
          for (const module of analysis.modules) {
            const prevModule = prevAnalysis.modules.find(
              (m: any) => m.id === module.id,
            );
            if (prevModule) {
              logDifference(
                `Module '${module.id}'`,
                prevModule.size,
                module.size,
              );
            } else {
              logNewModule(module.id, module.size);
            }
          }
          console.log('--- End Size Change Report ---');
        } catch {
          console.log('No previous bundle analysis found');
        }
      }
    },
  });
}

type GitHubLogType = 'debug' | 'notice' | 'warning' | 'error';

type GitHubLogOptions = {
  title?: string;
  file?: string;
  col?: number;
  endColumn?: number;
  line?: number;
  endLine?: number;
};

function logNewModule(name: string, size: number) {
  if (size < ABSOLUTE_BYTE_CHANGE_THRESHOLD) {
    return;
  }
  const type = 'notice';
  const options = {
    title: `New Module (${size} bytes in ${name})`,
  };
  const message = `${name} size: ${size} bytes`;
  logGithubMessage(type, message, options);
}

function logDifference(name: string, before: number, after: number) {
  const change = difference(before, after);
  if (
    change.absolute < ABSOLUTE_BYTE_CHANGE_THRESHOLD &&
    change.percent < PERCENT_CHANGE_THRESHOLD
  ) {
    return;
  }
  const type = 'error';
  const options = {
    title: `Important Size Change (${change.absolute} bytes in ${name})`,
  };
  const message = `${name} size change: ${
    change.absolute
  } bytes (${change.percent.toFixed(2)}%)`;
  logGithubMessage(type, message, options);
}

function logGithubMessage(
  type: GitHubLogType,
  message: string,
  options: GitHubLogOptions = {},
) {
  console.log(
    stripAnsiEscapes(
      `::${type} ${formatGithubOptions(options)}::${formatGithubMessage(
        message,
      )}`,
    ),
  );
}

function difference(before: number, after: number) {
  const percent = before ? (after / before) * 100 - 100 : after ? Infinity : 0;
  const absolute = after - before;
  return { percent, absolute };
}

function resolveJsonPaths(packageDir: string) {
  // TODO: should find a better way to match current w/ downloaded artifacts
  const runnerRoot = '../..';
  const analysisFilePath = 'dist/bundle-analysis.json';
  const previousAnalysisDir = 'downloads/previous-bundle-analysis';
  const currentPath = path.resolve(packageDir, analysisFilePath);
  const relativePath = path.relative(
    path.resolve(runnerRoot, 'packages'),
    packageDir,
  );
  const prevPath = path.resolve(
    runnerRoot,
    previousAnalysisDir,
    relativePath,
    analysisFilePath,
  );

  return { currentPath, prevPath };
}

const ansiRegex = new RegExp(
  '([\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~])))',
  'g',
);

function stripAnsiEscapes(str: string) {
  return str.replace(ansiRegex, '');
}

function formatGithubOptions(options: Record<string, string>) {
  return Object.entries(options)
    .map(([key, option]) => `${key}=${option}`)
    .join(',');
}

function formatGithubMessage(message: string) {
  return message.replace(/\n/g, '%0A');
}
