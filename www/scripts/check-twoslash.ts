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

interface TwoslashBlock {
  line: number;
  lang: string;
  meta: string;
  code: string;
}

interface BlockError {
  file: string;
  line: number;
  lang: string;
  code: string;
  errorTitle: string;
  errorDetails: string;
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

function extractTwoslashBlocks(content: string): TwoslashBlock[] {
  const blocks: TwoslashBlock[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(/^```(\w+)\s+(.*twoslash.*)$/);
    if (!match) continue;

    const lang = match[1]!;
    const meta = match[2]!;
    const codeLines: string[] = [];

    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j]!.startsWith('```')) {
        blocks.push({
          line: i + 1, // 1-indexed
          lang,
          meta,
          code: codeLines.join('\n'),
        });
        break;
      }
      codeLines.push(lines[j]!);
    }
  }

  return blocks;
}

function formatCodeSnippet(code: string, maxLines = 8): string {
  const lines = code.split('\n');
  const preview = lines.slice(0, maxLines);
  const result = preview.map((l) => `          | ${l}`).join('\n');
  if (lines.length > maxLines) {
    return result + `\n          | ... (${lines.length - maxLines} more lines)`;
  }
  return result;
}

/**
 * Parse a TwoslashError or generic Error into a structured title + details.
 * TwoslashError from @typescript/twoslash has .title, .description, .recommendation.
 * Generic errors just have .message with a formatted multi-section string.
 */
function parseError(err: unknown): { title: string; details: string } {
  if (!(err instanceof Error)) {
    return { title: 'Unknown error', details: String(err) };
  }

  // TwoslashError has structured fields
  const te = err as Error & {
    title?: string;
    description?: string;
    recommendation?: string;
  };
  if (te.title) {
    const parts = [te.description, te.recommendation].filter(Boolean);
    return { title: te.title, details: parts.join('\n\n') };
  }

  // Generic error — parse the formatted message
  const msg = err.message;

  // Extract the first heading line as title
  const headingMatch = msg.match(/^##\s*(.+)/m);
  const title = headingMatch?.[1]?.trim() ?? 'Twoslash error';

  // Extract compiler errors section
  const compilerIdx = msg.indexOf('Compiler Errors:');
  const codeIdx = msg.indexOf('## Code');
  let details: string;
  if (compilerIdx !== -1) {
    const end = codeIdx !== -1 ? codeIdx : msg.length;
    details = msg.slice(compilerIdx, end).trim();
  } else {
    // Strip the heading and "## Code" section, keep the rest
    const end = codeIdx !== -1 ? codeIdx : msg.length;
    details = msg
      .slice(0, end)
      .replace(/^##\s*.+/m, '')
      .trim();
  }

  return { title, details };
}

/**
 * Try to match an error to a specific twoslash block.
 * The error message often contains the virtual filename (e.g., "server.ts")
 * which corresponds to a @filename directive in the block code, or the
 * "## Code" section at the bottom of the error message contains the code.
 */
function matchErrorToBlock(
  err: unknown,
  blocks: TwoslashBlock[],
): TwoslashBlock | undefined {
  if (blocks.length <= 1) return blocks[0];

  const msg = err instanceof Error ? err.message : String(err);

  // Try to match using the "## Code" section from the error
  const codeMatch = msg.match(/## Code\n\n```\w+\n([\s\S]+?)```/);
  if (codeMatch) {
    const errorCode = codeMatch[1]!.trim();
    // Find the block whose code contains the first few lines of the error code
    const firstLines = errorCode.split('\n').slice(0, 3).join('\n');
    const match = blocks.find((b) => b.code.includes(firstLines));
    if (match) return match;
  }

  // Fall back to first block (the pipeline fails on first error)
  return blocks[0];
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

  const allErrors: BlockError[] = [];
  let checkedFiles = 0;
  let checkedBlocks = 0;

  // Process files sequentially (remark-shiki-twoslash uses a module-level includes Map)
  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');
    if (!content.includes('twoslash')) {
      continue;
    }

    checkedFiles++;
    const rel = relative(wwwDir, filePath);
    const blocks = extractTwoslashBlocks(content);
    checkedBlocks += blocks.length;

    try {
      await processor.process(content);
      process.stdout.write(`  PASS  ${rel}  (${blocks.length} blocks)\n`);
    } catch (err) {
      const { title, details } = parseError(err);
      const block = matchErrorToBlock(err, blocks);
      const line = block?.line ?? 0;

      allErrors.push({
        file: rel,
        line,
        lang: block?.lang ?? 'ts',
        code: block?.code ?? '',
        errorTitle: title,
        errorDetails: details,
      });

      process.stderr.write(`\n  FAIL  ${rel}:${line}\n`);
      process.stderr.write(`        ${title}\n`);
      if (details) {
        for (const l of details.split('\n').slice(0, 10)) {
          process.stderr.write(`        ${l}\n`);
        }
      }
      if (block?.code) {
        process.stderr.write(`\n        Code block (line ${line}):\n`);
        process.stderr.write(formatCodeSnippet(block.code) + '\n');
      }
    }
  }

  // Summary
  console.log(`\n---`);
  console.log(
    `Checked ${checkedBlocks} twoslash blocks across ${checkedFiles} files`,
  );

  if (allErrors.length > 0) {
    console.error(`\n${allErrors.length} file(s) had twoslash errors:\n`);
    for (const e of allErrors) {
      console.error(`  ${e.file}:${e.line}  ${e.errorTitle}`);
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
