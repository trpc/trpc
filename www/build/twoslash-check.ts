/**
 * Compiles every Twoslash block in the v11 docs and the blog, block by
 * block, and lists each one that fails, with its file and line. The build
 * fails on the first; this finds them all. `node build/twoslash-check.ts
 * [file…]` checks only the files named.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Effect, FileSystem, Path } from 'effect';

import { messageOf } from './content-error.ts';
import { commentsOf, fromDocusaurus } from './docusaurus-syntax.ts';
import { releaseTwoslashers, renderMarkdown } from './markdown.ts';
import { samplesDir } from './paths.ts';

const here = (relative: string) => new URL(relative, import.meta.url).pathname;

const roots = [here('../v11/docs'), here('../v11/home'), here('../blog')];

interface Block {
  readonly code: string;
  readonly file: string;
  /** Whether it's a `twoslash include` block, which the others' `// @include:` expand. */
  readonly include: boolean;
  readonly line: number;
}

/**
 * The ` ```ts twoslash ` fences in `markdown` outside its HTML comments,
 * each as markdown of its own, those in a blockquote (an alert's) too.
 */
function blocksOf(file: string, markdown: string): ReadonlyArray<Block> {
  const lines = markdown.split('\n');
  for (const comment of commentsOf(lines)) {
    lines.fill('', comment.start, comment.end + 1);
  }
  const blocks: Array<Block> = [];
  for (let start = 0; start < lines.length; start++) {
    const open = /^((?:[ \t]*>)*[ \t]*)(`{3,}|~{3,})\w*[^\n]*\btwoslash\b/.exec(
      lines[start] ?? '',
    );
    if (!open) {
      continue;
    }
    const quote = /^(?:[ \t]*>)*/.exec(open[1] ?? '')?.[0] ?? '';
    const unquoted = (line: string) =>
      line.startsWith(quote)
        ? line.slice(quote.length).replace(/^ /, '')
        : line;
    const fence = open[2] ?? '```';
    const end = lines.findIndex(
      (line, index) =>
        index > start && unquoted(line).trimStart().startsWith(fence),
    );
    if (end === -1) {
      continue;
    }
    blocks.push({
      code: lines
        .slice(start, end + 1)
        .map(quote === '' ? (line) => line : unquoted)
        .join('\n'),
      file,
      include: /^(?:`{3,}|~{3,})twoslash include\b/.test(
        unquoted(lines[start] ?? '').trimStart(),
      ),
      line: start + 1,
    });
    start = end;
  }
  return blocks;
}

const markdownFiles = Effect.fn('markdownFiles')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = yield* fs.readDirectory(root, { recursive: true });
  return names
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(root, name))
    .toSorted();
});

const check = Effect.fn('check')(function* (only: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files =
    only.length > 0
      ? only.map((file) => path.resolve(file))
      : (yield* Effect.forEach(roots, markdownFiles)).flat();
  const failures: Array<string> = [];
  let count = 0;
  for (const file of files) {
    const markdown = yield* fs.readFileString(file);
    const blocks = blocksOf(file, markdown);
    const includes = blocks
      .filter((block) => block.include)
      .map((block) => block.code)
      .join('\n\n');
    for (const block of blocks.filter((candidate) => !candidate.include)) {
      count++;
      const read = fromDocusaurus(`${includes}\n\n${block.code}`, true);
      const result = yield* renderMarkdown(read.markdown, {
        basePath: '/docs',
        inlineApp: 'v11',
        samplesDir,
        slug: 'twoslash-check',
        sourceUrl: '',
      }).pipe(Effect.result);
      const problems = [
        ...read.problems,
        ...(result._tag === 'Failure'
          ? [messageOf(result.failure).trim()]
          : []),
      ];
      if (problems.length > 0) {
        const where = `${path.relative(process.cwd(), block.file)}:${block.line}`;
        failures.push(`${where}\n${problems.join('\n')}`);
        yield* Console.error(`✗ ${where}`);
      }
    }
  }
  releaseTwoslashers();
  if (failures.length > 0) {
    yield* Console.error(
      `\n${failures.join('\n\n')}\n\n${failures.length} of ${count} Twoslash blocks failed`,
    );
    return yield* Effect.fail(new Error('Twoslash check failed'));
  }
  yield* Console.log(
    `${count} Twoslash blocks in ${files.length} files compiled`,
  );
});

if (import.meta.main) {
  check(process.argv.slice(2)).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
