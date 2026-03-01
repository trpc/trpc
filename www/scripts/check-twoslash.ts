import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';

// Match the import pattern used in docusaurus.config.ts
const remarkShikiTwoslash =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('remark-shiki-twoslash').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const shikiConfig = require('../shikiTwoslash.config');

interface ErrorRecord {
  file: string;
  message: string;
}

function findMarkdownFiles(baseDir: string): string[] {
  const entries = readdirSync(baseDir, { withFileTypes: true, recursive: true });
  return entries
    .filter(
      (e) =>
        !e.isDirectory() &&
        (e.name.endsWith('.md') || e.name.endsWith('.mdx')),
    )
    .map((e) => resolve(e.parentPath ?? e.path, e.name));
}

async function main() {
  const includeVersioned = process.argv.includes('--include-versioned');
  const wwwDir = resolve(__dirname, '..');

  // Gather files from docs and blog (optionally versioned_docs)
  const dirs = ['docs', 'blog'];
  if (includeVersioned) {
    dirs.push('versioned_docs');
  }

  const files: string[] = [];
  for (const dir of dirs) {
    const absDir = resolve(wwwDir, dir);
    try {
      files.push(...findMarkdownFiles(absDir));
    } catch {
      // Directory may not exist (e.g., no blog/)
    }
  }

  // Create the unified processor with twoslash
  // Note: "alwayRaiseForTwoslashExceptions" typo is in the library itself
  const processor = unified()
    .use(remarkParse)
    .use(remarkShikiTwoslash, {
      ...shikiConfig,
      alwayRaiseForTwoslashExceptions: true,
    })
    .use(remarkStringify);

  const errors: ErrorRecord[] = [];
  let checkedCount = 0;

  // Process files sequentially (remark-shiki-twoslash uses a module-level includes Map)
  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');
    if (!content.includes('twoslash')) {
      continue;
    }

    checkedCount++;
    const rel = relative(wwwDir, filePath);

    try {
      await processor.process(content);
      process.stdout.write(`  PASS  ${rel}\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ file: rel, message });
      process.stderr.write(`  FAIL  ${rel}\n`);
      for (const line of message.split('\n').slice(0, 10)) {
        process.stderr.write(`        ${line}\n`);
      }
    }
  }

  // Summary
  console.log(`\n---`);
  console.log(`Checked ${checkedCount} files with twoslash blocks`);

  if (errors.length > 0) {
    console.error(`\n${errors.length} file(s) had twoslash errors:`);
    for (const { file } of errors) {
      console.error(`  - ${file}`);
    }
    process.exit(1);
  } else {
    console.log('All twoslash blocks compiled successfully.');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(2);
});
