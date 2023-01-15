import boxen from 'boxen';
import chalk from 'chalk';
import { Theme, highlight } from 'cli-highlight';
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

export const promptCode = async (opts: { code: string; path: string }) => {
  console.log('');
  const message = `tRPC is about to create the following file:

${boxen(highlightCode(opts.code), { title: opts.path, padding: 1, width: 80 })}

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
