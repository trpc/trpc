import boxen from 'boxen';
import chalk from 'chalk';
import { Theme, highlight } from 'cli-highlight';
import { diffWords } from 'diff';
import fs from 'fs';
import inquirer from 'inquirer';
import path from 'path';

export const logger = {
  info: (msg: string) =>
    console.log(chalk.cyanBright('[trpc-init] INFO:', msg)),
  error: (msg: string) =>
    console.log(chalk.redBright('[trpc-init] ERROR:', msg)),
};

export function writeFileSyncRecursive(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

export const highlightCode = (code: string, language = 'typescript') => {
  const theme: Theme = {
    string: chalk.green,
    comment: chalk.gray,
    keyword: chalk.cyanBright,
    built_in: chalk.greenBright,
  };

  return highlight(code, { language, theme });
};

/** FIXME: Output is kinda whack */
export const getCodeDiffString = (input: string, output: string) => {
  const changes: string[] = [];
  for (const change of diffWords(input, output)) {
    const lines = change.value.trim().split('\n').slice(0, change.count);
    if (lines.length === 0) continue;
    console.log('change', change);
    if (change.added) {
      if (!change.value.trim()) continue;
      changes.push(change.value);
    }
  }

  let diffed = output;
  for (const newContent of changes) {
    const coloredOutput = newContent
      .split('\n')
      .map((ln) => (ln ? chalk.greenBright(ln) : ''))
      .join('\n');
    diffed = diffed.replace(newContent, coloredOutput);
  }

  return diffed;
};

export const promptCode = async (opts: {
  code: string;
  path: string;
  mode: 'EDIT' | 'CREATE';
  input?: string /** only needed if mode = EDIT */;
}) => {
  const code =
    opts.mode === 'EDIT'
      ? getCodeDiffString(opts.input as string, opts.code)
      : highlightCode(opts.code);

  console.log('');
  const message = `tRPC is about to ${
    opts.mode === 'EDIT' ? 'edit' : 'create'
  } the following file:

${boxen(code, { title: opts.path, padding: 1, width: 80 })}

Do you want to proceed?`;

  const { value } = await inquirer.prompt<{ value: boolean }>([
    {
      type: 'confirm',
      name: 'value',
      message,
      default: true,
    },
  ]);

  return value;
};
