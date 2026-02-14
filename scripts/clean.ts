import { rm } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';

const CLEAN_DIR_PATTERNS = [
  '**/node_modules',
  '**/.turbo',
  '**/.next',
  '**/dist',
  '**/__generated__',
];

async function main() {
  const directories = await fg(CLEAN_DIR_PATTERNS, {
    cwd: process.cwd(),
    onlyDirectories: true,
    dot: true,
    unique: true,
    followSymbolicLinks: false,
    ignore: ['**/.git/**'],
  });

  // Delete deepest paths first to avoid duplicate work.
  const sortedDirectories = directories.sort((a, b) => b.length - a.length);
  await Promise.all(
    sortedDirectories.map(async (directory) => {
      await rm(path.resolve(directory), { recursive: true, force: true });
    }),
  );

  console.log(`Removed ${sortedDirectories.length} build directories.`);
}

await main();
